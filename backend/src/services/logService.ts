/**
 * @file 日志存储服务（成员D）
 * @author 第八组（成员D）
 * @date 2026-11-10
 * @description
 *   1) initTables()  幂等建表，定义与 backend/sql/03_log_schema.sql 完全一致，
 *                    保证「忘记跑 SQL 脚本」时后端也能自建表；改结构时两处必须同步。
 *   2) 提供 operation_log / error_log 的写入与查询封装，路由层只管参数校验。
 *   写操作走主库、读操作走从库，复用 analytics/db.js 的统一连接池。
 */
import { executeRead, executeWrite } from '../analytics/db.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('log-service');

/** SQL 参数类型 */
type SqlParam = string | number | boolean | Date | null;

/** 操作日志写入参数 */
export interface OperationLogRecord {
  traceId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  pagePath: string | null;
  userId: string | null;
  clientTs: number | null;
  extra: Record<string, unknown> | null;
}

/** 错误日志写入参数 */
export interface ErrorLogRecord {
  traceId: string;
  errorName: string;
  errorMessage: string;
  stackTrace: string | null;
  pagePath: string | null;
  source: string | null;
  userId: string | null;
  clientTs: number | null;
  extra: Record<string, unknown> | null;
}

/** 查询过滤条件 */
export interface LogQuery {
  traceId?: string;
  resourceType?: string;
  source?: string;
  limit: number;
}

/**
 * 初始化日志数据表（幂等，已存在则跳过）
 * 表结构与 backend/sql/03_log_schema.sql 保持一致
 */
export async function initTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS operation_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        trace_id VARCHAR(64) NOT NULL COMMENT '全链路追踪 ID',
        action VARCHAR(64) NOT NULL COMMENT '动作类型',
        resource_type VARCHAR(64) NOT NULL COMMENT '资源类型',
        resource_id VARCHAR(128) NOT NULL COMMENT '资源 ID',
        page_path VARCHAR(255) DEFAULT NULL COMMENT '前端路由',
        user_id VARCHAR(64) DEFAULT NULL COMMENT '用户 ID',
        client_ts BIGINT DEFAULT NULL COMMENT '前端时间戳（毫秒）',
        extra TEXT COMMENT '额外字段（JSON 字符串）',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_operation_log_trace_id (trace_id),
        INDEX idx_operation_log_created_at (created_at),
        INDEX idx_operation_log_resource (resource_type, resource_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端操作日志（成员D）'
    `);

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS error_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        trace_id VARCHAR(64) NOT NULL COMMENT '全链路追踪 ID',
        error_name VARCHAR(128) NOT NULL COMMENT '错误类型',
        error_message TEXT NOT NULL COMMENT '错误信息',
        stack_trace TEXT COMMENT '错误堆栈',
        page_path VARCHAR(255) DEFAULT NULL COMMENT '前端路由',
        source VARCHAR(64) DEFAULT NULL COMMENT '捕获来源',
        user_id VARCHAR(64) DEFAULT NULL COMMENT '用户 ID',
        client_ts BIGINT DEFAULT NULL COMMENT '前端时间戳（毫秒）',
        extra TEXT COMMENT '额外字段（JSON 字符串）',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_error_log_trace_id (trace_id),
        INDEX idx_error_log_created_at (created_at),
        INDEX idx_error_log_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端错误日志（成员D）'
    `);

    log.INFO('operation_log / error_log 表初始化成功');
  } catch (error) {
    log.ERROR(`日志数据表初始化失败: ${String(error)}`);
    throw error;
  }
}

/**
 * 写入一条操作日志
 * @param record 日志内容
 * @returns 新记录 ID
 */
export async function insertOperationLog(record: OperationLogRecord): Promise<number> {
  const result = await executeWrite<{ insertId: number }>(
    `INSERT INTO operation_log
       (trace_id, action, resource_type, resource_id, page_path, user_id, client_ts, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.traceId,
      record.action,
      record.resourceType,
      record.resourceId,
      record.pagePath,
      record.userId,
      record.clientTs,
      record.extra === null ? null : JSON.stringify(record.extra),
    ]
  );
  return result.insertId;
}

/**
 * 写入一条错误日志
 * @param record 错误内容
 * @returns 新记录 ID
 */
export async function insertErrorLog(record: ErrorLogRecord): Promise<number> {
  const result = await executeWrite<{ insertId: number }>(
    `INSERT INTO error_log
       (trace_id, error_name, error_message, stack_trace, page_path, source, user_id, client_ts, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.traceId,
      record.errorName,
      record.errorMessage,
      record.stackTrace,
      record.pagePath,
      record.source,
      record.userId,
      record.clientTs,
      record.extra === null ? null : JSON.stringify(record.extra),
    ]
  );
  return result.insertId;
}

/**
 * 查询操作日志（按 trace_id / 资源类型过滤）
 */
export async function queryOperationLogs(query: LogQuery): Promise<Record<string, unknown>[]> {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  if (query.traceId) {
    conditions.push('trace_id = ?');
    params.push(query.traceId);
  }
  if (query.resourceType) {
    conditions.push('resource_type = ?');
    params.push(query.resourceType);
  }
  params.push(query.limit);

  return executeRead<Record<string, unknown>[]>(
    `SELECT id, trace_id, action, resource_type, resource_id, page_path, user_id,
            client_ts, extra, created_at
     FROM operation_log
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );
}

/**
 * 查询错误日志（按 trace_id / 来源过滤）
 */
export async function queryErrorLogs(query: LogQuery): Promise<Record<string, unknown>[]> {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  if (query.traceId) {
    conditions.push('trace_id = ?');
    params.push(query.traceId);
  }
  if (query.source) {
    conditions.push('source = ?');
    params.push(query.source);
  }
  params.push(query.limit);

  return executeRead<Record<string, unknown>[]>(
    `SELECT id, trace_id, error_name, error_message, stack_trace, page_path,
            source, user_id, client_ts, extra, created_at
     FROM error_log
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );
}
