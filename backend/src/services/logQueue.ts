/**
 * @file 日志消息队列（成员D · 数据洞察）
 * @description 用 Redis Stream 解耦「业务写日志」与「日志落库」：
 *              - 生产者：业务侧调用 saveXxxLog 时 XADD 一条消息，立即返回，不阻塞业务响应
 *              - 消费者：独立连接 XREADGROUP 拉取消息，按类型写入 MySQL 后 XACK
 *              消息结构：{ type: 'error' | 'operation' | 'login', payload: JSON 字符串 }
 *              Redis 不可用时生产者返回 false，由 logService 降级为直写 MySQL。
 */

import type Redis from 'ioredis';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';
import { createRedisClient, getRedisClient } from '../common/redis.js';
import { executeWrite } from '../analytics/db.js';

const log = createLogger('log-queue');

/** 日志类型，对应三张日志表 */
export type LogType = 'error' | 'operation' | 'login';

/** 一次拉取的最大消息数 */
const READ_COUNT = 50;
/** XREADGROUP 阻塞等待毫秒数 */
const READ_BLOCK_MS = 2000;
/** 消费异常后的重试间隔 */
const RETRY_DELAY_MS = 1000;

let consumerClient: Redis | null = null;
let running = false;

/** 消费者名，多节点时各自持有独立名称，便于排查消息归属 */
const consumerName = `node-${process.pid}`;

/**
 * 生产一条日志消息
 * @returns true 表示已入队；false 表示 Redis 不可用，调用方应自行降级
 */
export async function enqueueLog(type: LogType, payload: Record<string, unknown>): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.xadd(
      config.redis.logStream,
      '*',
      'type',
      type,
      'payload',
      JSON.stringify(payload)
    );
    return true;
  } catch (error) {
    log.ERROR(`日志入队失败 type=${type}: ${String(error)}`);
    return false;
  }
}

/**
 * 把一条日志消息写入 MySQL 主库
 * 消费者与降级路径共用，保证两种方式落库结构完全一致
 */
export async function persistLog(type: LogType, payload: Record<string, unknown>): Promise<void> {
  switch (type) {
    case 'error':
      await executeWrite(
        `INSERT INTO error_log
          (trace_id, error_type, error_code, stack, route, service, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          param(payload.trace_id),
          param(payload.error_type),
          param(payload.error_code),
          param(payload.stack),
          param(payload.route),
          param(payload.service),
          param(payload.user_id)
        ]
      );
      return;

    case 'operation':
      await executeWrite(
        `INSERT INTO operation_log
          (trace_id, user_id, api_path, http_method, request_params,
           response_code, duration_ms, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          param(payload.trace_id),
          param(payload.user_id),
          param(payload.api_path),
          param(payload.http_method),
          param(payload.request_params),
          param(payload.response_code),
          param(payload.duration_ms),
          param(payload.ip),
          param(payload.user_agent)
        ]
      );
      return;

    case 'login':
      await executeWrite(
        `INSERT INTO login_log
          (trace_id, username, ip, login_result, fail_reason)
         VALUES (?, ?, ?, ?, ?)`,
        [
          param(payload.trace_id),
          param(payload.username),
          param(payload.ip),
          param(payload.login_result),
          param(payload.fail_reason)
        ]
      );
      return;
  }
}

/**
 * 启动日志消费者（应用启动时调用，须在日志表初始化之后）
 */
export async function startLogQueueConsumer(): Promise<void> {
  if (running) return;

  const client = createRedisClient('log-consumer');
  try {
    await client.connect();
    // 消费组已存在会抛 BUSYGROUP，属于正常情况
    try {
      await client.xgroup('CREATE', config.redis.logStream, config.redis.logGroup, '$', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }

    consumerClient = client;
    running = true;
    void consumeLoop();
    log.INFO(
      `日志消费者已启动 stream=${config.redis.logStream} group=${config.redis.logGroup} consumer=${consumerName}`
    );
  } catch (error) {
    client.disconnect();
    log.ERROR(`日志消费者启动失败: ${String(error)}`);
  }
}

/**
 * 停止日志消费者（应用退出时调用）
 */
export async function stopLogQueueConsumer(): Promise<void> {
  running = false;
  const client = consumerClient;
  consumerClient = null;
  if (!client) return;

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  log.INFO('日志消费者已停止');
}

/** 消费主循环：阻塞读取 → 落库 → XACK */
async function consumeLoop(): Promise<void> {
  while (running) {
    const client = consumerClient;
    if (!client) return;

    try {
      // ioredis 未给 XREADGROUP 标注返回类型，这里按协议结构断言
      const reply = (await client.xreadgroup(
        'GROUP', config.redis.logGroup, consumerName,
        'COUNT', READ_COUNT,
        'BLOCK', READ_BLOCK_MS,
        'STREAMS', config.redis.logStream, '>'
      )) as [string, [string, string[]][]][] | null;

      for (const [, messages] of reply ?? []) {
        for (const [id, fields] of messages) {
          const message = parseMessage(fields);
          if (!message) {
            log.WARN(`日志消息格式非法，已丢弃 id=${id}`);
            await client.xack(config.redis.logStream, config.redis.logGroup, id);
            continue;
          }

          try {
            await persistLog(message.type, message.payload);
            await client.xack(config.redis.logStream, config.redis.logGroup, id);
          } catch (error) {
            // 不 ACK：消息留在 pending 列表，等待人工或后续重试，避免日志静默丢失
            log.ERROR(`日志落库失败 id=${id}，保留在待确认队列: ${String(error)}`);
          }
        }
      }
    } catch (error) {
      if (!running) return;
      log.ERROR(`日志消费异常，${RETRY_DELAY_MS}ms 后重试: ${String(error)}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

/** 解析 Stream 字段数组 ['type','error','payload','{...}'] */
function parseMessage(fields: string[]): { type: LogType; payload: Record<string, unknown> } | null {
  let type = '';
  let rawPayload = '';
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i] === 'type') type = fields[i + 1];
    if (fields[i] === 'payload') rawPayload = fields[i + 1];
  }

  if (type !== 'error' && type !== 'operation' && type !== 'login') return null;
  try {
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    return { type, payload };
  } catch {
    return null;
  }
}

/** 把消息中的任意值转成 SQL 参数（对象统一序列化为 JSON 字符串） */
function param(value: unknown): string | number | boolean | Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return value;
  }
  return JSON.stringify(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
