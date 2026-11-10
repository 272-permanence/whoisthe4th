/**
 * @file 公共层：Redis 连接管理（成员D · 数据洞察）
 * @description 为消息队列提供三类连接：
 *              1. 命令连接：生产者 XADD、大屏统计发布与分布式锁
 *              2. 订阅连接：Pub/Sub 专用（订阅态下该连接不能再执行普通命令）
 *              3. 独立连接：日志消费者 XREADGROUP BLOCK（阻塞命令会占用整条连接）
 *              Redis 未启用或连不上时返回 null，调用方降级处理，保证后端仍可启动。
 */

import Redis from 'ioredis';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

/** 连接失败后的最大重试次数，超过后不再自动重连，由调用方降级 */
const RETRY_LIMIT = 10;

let sharedClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * 创建一个懒连接客户端（调用方负责 connect）
 * @param purpose 用途名，仅用于日志排查
 */
export function createRedisClient(purpose: string): Redis {
  const client = new Redis(config.redis.url, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > RETRY_LIMIT ? null : Math.min(times * 300, 2000))
  });

  client.on('error', (error) => {
    log.WARN(`Redis[${purpose}] 连接异常: ${error.message}`);
  });
  client.on('ready', () => {
    log.INFO(`Redis[${purpose}] 已就绪`);
  });

  return client;
}

/**
 * 初始化命令连接（应用启动时调用一次）
 * @returns 是否可用；false 表示未启用或连接失败，需要降级
 */
export async function initRedis(): Promise<boolean> {
  if (!config.redis.enabled) {
    log.WARN('REDIS_ENABLED=false，消息队列关闭，日志直写 MySQL、大屏仅本机推送');
    return false;
  }
  if (sharedClient?.status === 'ready') return true;

  const client = createRedisClient('main');
  try {
    await client.connect();
    await client.ping();
    sharedClient = client;
    log.INFO(`Redis 已连接 ${config.redis.url}`);
    return true;
  } catch (error) {
    client.disconnect();
    log.WARN(`Redis 不可用，降级为直写 MySQL + 本机 SSE: ${String(error)}`);
    return false;
  }
}

/**
 * 获取命令连接
 * @returns 未初始化或已断开时返回 null
 */
export function getRedisClient(): Redis | null {
  return sharedClient?.status === 'ready' ? sharedClient : null;
}

/**
 * 获取 Pub/Sub 专用订阅连接（单例）
 * @returns 连接失败时返回 null
 */
export async function getSubscriberClient(): Promise<Redis | null> {
  if (subscriberClient?.status === 'ready') return subscriberClient;
  if (!sharedClient) return null;

  const client = createRedisClient('subscriber');
  try {
    await client.connect();
    subscriberClient = client;
    return client;
  } catch (error) {
    client.disconnect();
    log.WARN(`Redis 订阅连接创建失败: ${String(error)}`);
    return null;
  }
}

/**
 * 关闭命令连接与订阅连接（应用退出时调用）
 */
export async function closeRedis(): Promise<void> {
  const clients = [subscriberClient, sharedClient].filter((c): c is Redis => c !== null);
  subscriberClient = null;
  sharedClient = null;
  for (const client of clients) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
  if (clients.length > 0) log.INFO('Redis 连接已关闭');
}
