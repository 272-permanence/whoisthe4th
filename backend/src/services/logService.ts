/**
 * @file 日志存储服务（D 专属，B/C/A 调用）
 * @description 给错误日志/操作日志/登录日志写入 MySQL。**仅 D 能修改此文件**。
 *              当前为空实现占位，D 写完数据库表后直接覆盖 async 函数体即可。
 *              B/C/A 已经在用这些函数签名写调用代码，D 不要改函数名和参数结构。
 * @author 第八组（成员D）
 * @date 2026-11-09（占位，等 D 实现）
 */

/** error_log 表写入参数（严格对齐 DDL） */
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

/** operation_log 表写入参数（严格对齐 DDL） */
export interface OperationLogInsert {
  trace_id: string;
  user_id: number | null;
  api_path: string;
  http_method: string;
  request_params?: unknown;       // 已经过 maskParams 脱敏
  response_code: number;
  duration_ms?: number;
  ip?: string | null;
  user_agent?: string | null;
}

/** login_log 表写入参数（严格对齐 DDL） */
export interface LoginLogInsert {
  trace_id: string;
  username: string | null;         // 已经过 maskSingle 脱敏
  ip: string | null;
  login_result: string;            // success / fail_wrong_password / fail_user_not_found
  fail_reason?: string | null;
}

/**
 * 错误日志存储（B 的 errorLogger 调用）
 * D 实现：INSERT INTO error_log (...) VALUES (...)
 */
export async function saveErrorLog(_log: ErrorLogInsert): Promise<void> {
  // 占位空实现，等 D 写完 MySQL 表后覆盖
}

/**
 * 操作日志存储（B 的 operationLog 中间件调用）
 * D 实现：INSERT INTO operation_log (...) VALUES (...)
 */
export async function saveOperationLog(_log: OperationLogInsert): Promise<void> {
  // 占位空实现，等 D 写完 MySQL 表后覆盖
}

/**
 * 登录日志存储（C 的 auth 路由调用）
 * D 实现：INSERT INTO login_log (...) VALUES (...)
 */
export async function saveLoginLog(_log: LoginLogInsert): Promise<void> {
  // 占位空实现，等 D 写完 MySQL 表后覆盖
}
