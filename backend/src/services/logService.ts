/**
 * @file 日志存储服务（成员D · 数据洞察）
 * @description 提供 error_log / operation_log / login_log 三张表的写入接口，
 *              供 B/C/A 等业务模块在处理请求时调用。
 *
 *              设计要点：
 *              1. 绝对不阻塞调用方：函数返回 Promise<void>，调用方 fire-and-forget，
 *                 不 await（日志写入失败不应影响业务响应）。
 *              2. 日志先投递到 Redis Stream（见 services/logQueue.ts），由独立消费者
 *                 批量落 MySQL 主库；Redis 不可用时自动降级为直写主库。
 *              3. 建表脚本见 backend/sql/03_log_schema.sql，启动时 initTables() 兜底。
 */

import { executeWrite } from '../analytics/db.js';
import { createLogger } from '../common/logger.js';
import { enqueueLog, persistLog, type LogType } from './logQueue.js';

const log = createLogger('log-service');

// ============================ 类型定义（与 B 的 errorLogger/operationLog 接口对齐） ============================

/** 错误日志（不含 id / created_at，由数据库自动生成） */
export interface ErrorLog {
  id: number;
  trace_id: string;
  error_type: 'business' | 'system' | 'dependency';
  error_code?: string | null;
  stack?: string | null;
  route?: string | null;
  service?: string | null;
  user_id?: number | null;
  created_at: Date;
}

/** 操作日志（不含 id / created_at） */
export interface OperationLog {
  id: number;
  trace_id: string;
  user_id?: number | null;
  api_path: string;
  http_method: string;
  request_params?: Record<string, unknown> | null;
  response_code: number;
  duration_ms?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: Date;
}

/** 登录日志（不含 id / created_at） */
export interface LoginLog {
  id: number;
  trace_id: string;
  username?: string | null;
  ip?: string | null;
  login_result: string;
  fail_reason?: string | null;
  created_at: Date;
}

// ============================ B 的占位接口（保留兼容） ============================

/** error_log 表写入参数（严格对齐 DDL，B 的 errorLogger 调用） */
export interface ErrorLogInsert {
  trace_id: string;
  error_type: string;
  error_code: string | null;
  stack: string | null;
  route: string | null;
  service: string | null;
  user_id: number | null;
  context?: string | null;
}

/** operation_log 表写入参数（严格对齐 DDL，B 的 operationLog 中间件调用） */
export interface OperationLogInsert {
  trace_id: string;
  user_id: number | null;
  api_path: string;
  http_method: string;
  request_params?: unknown;
  response_code: number;
  duration_ms?: number;
  ip?: string | null;
  user_agent?: string | null;
}

/** login_log 表写入参数（严格对齐 DDL，C 的 auth 路由调用） */
export interface LoginLogInsert {
  trace_id: string;
  username: string | null;
  ip: string | null;
  login_result: string;
  fail_reason?: string | null;
}

// ============================ 写入函数 ============================

/**
 * 保存一条错误日志
 * 调用方不要 await，内部异常会被吞掉并打日志，绝不影响业务流程
 */
export async function saveErrorLog(
  entry: Omit<ErrorLog, 'id' | 'created_at'> | ErrorLogInsert
): Promise<void> {
  await dispatch('error', entry as Record<string, unknown>);
}

/**
 * 保存一条操作日志
 * request_params 会被序列化为 JSON 字符串存入 JSON 列
 * 调用方不要 await
 */
export async function saveOperationLog(
  entry: Omit<OperationLog, 'id' | 'created_at'> | OperationLogInsert
): Promise<void> {
  await dispatch('operation', entry as Record<string, unknown>);
}

/**
 * 保存一条登录日志
 * 调用方不要 await
 */
export async function saveLoginLog(
  entry: Omit<LoginLog, 'id' | 'created_at'> | LoginLogInsert
): Promise<void> {
  await dispatch('login', entry as Record<string, unknown>);
}

/**
 * 统一出口：优先投递到 Redis 队列，Redis 不可用时降级直写 MySQL
 * @param type 日志类型
 * @param entry 日志内容
 */
async function dispatch(type: LogType, entry: Record<string, unknown>): Promise<void> {
  try {
    if (await enqueueLog(type, entry)) return;
    await persistLog(type, entry);
  } catch (error) {
    log.ERROR(`保存${type}日志失败 trace=${String(entry.trace_id)}: ${String(error)}`);
  }
}

// ============================ 建表兜底 ============================

/**
 * 初始化日志表（幂等），与 backend/sql/03_log_schema.sql 保持一致。
 * 忘记跑 SQL 脚本时后端也能自建表，保证服务可用。
 */
export async function initTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS error_log (
        id          BIGINT       NOT NULL AUTO_INCREMENT,
        trace_id    VARCHAR(64)  NOT NULL,
        error_type  VARCHAR(32)  NOT NULL,
        error_code  VARCHAR(64)  DEFAULT NULL,
        stack       MEDIUMTEXT   DEFAULT NULL,
        route       VARCHAR(255) DEFAULT NULL,
        service     VARCHAR(128) DEFAULT NULL,
        user_id     BIGINT       DEFAULT NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_error_log_trace_id (trace_id),
        KEY idx_error_log_error_type (error_type),
        KEY idx_error_log_created_at (created_at),
        KEY idx_error_log_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='错误日志（成员D）'
    `);

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS operation_log (
        id             BIGINT       NOT NULL AUTO_INCREMENT,
        trace_id       VARCHAR(64)  NOT NULL,
        user_id        BIGINT       DEFAULT NULL,
        api_path       VARCHAR(255) NOT NULL,
        http_method    VARCHAR(16)  NOT NULL,
        request_params TEXT         DEFAULT NULL,
        response_code  INT          NOT NULL,
        duration_ms    INT          DEFAULT NULL,
        ip             VARCHAR(64)  DEFAULT NULL,
        user_agent     VARCHAR(512) DEFAULT NULL,
        created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_operation_log_trace_id (trace_id),
        KEY idx_operation_log_user_id (user_id),
        KEY idx_operation_log_api_path (api_path),
        KEY idx_operation_log_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志（成员D）'
    `);

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS login_log (
        id            BIGINT       NOT NULL AUTO_INCREMENT,
        trace_id      VARCHAR(64)  NOT NULL,
        username      VARCHAR(64)  DEFAULT NULL,
        ip            VARCHAR(64)  DEFAULT NULL,
        login_result  VARCHAR(32)  NOT NULL,
        fail_reason   VARCHAR(255) DEFAULT NULL,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_login_log_trace_id (trace_id),
        KEY idx_login_log_username (username),
        KEY idx_login_log_ip (ip),
        KEY idx_login_log_login_result (login_result),
        KEY idx_login_log_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志（成员D）'
    `);

    log.INFO('error_log / operation_log / login_log 表初始化成功');
  } catch (error) {
    log.ERROR(`日志表初始化失败: ${String(error)}`);
    throw error;
  }
}
