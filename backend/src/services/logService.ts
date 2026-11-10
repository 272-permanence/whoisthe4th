/**
 * @file 登录日志服务
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 记录每次登录尝试（成功/失败），用于安全审计与问题排查。
 *              写入与 auth 业务同一个 SQLite 连接（data/auth.db），
 *              表结构在本模块内幂等创建，不改动 backend/sql/ 下的脚本。
 */
import { getAuthDb } from './authDb.js';

/** 登录结果枚举 */
export type LoginResult =
  | 'success'
  | 'fail_wrong_password'
  | 'fail_user_not_found'
  | 'fail_user_disabled'
  /** 第三方 / 统一认证失败（验证码错误、票据无效、证书无效、账号禁用等） */
  | 'fail_external';

/** 登录日志入参 */
export interface LoginLogInput {
  /** 全链路追踪 ID */
  traceId: string;
  /** 已脱敏的用户名 */
  username: string;
  /** 客户端 IP */
  ip: string;
  /** 登录结果 */
  loginResult: LoginResult;
}

/** 登录日志行 */
export interface LoginLogRow {
  id: number;
  trace_id: string;
  username: string;
  ip: string | null;
  login_result: string;
  created_at: string;
}

let tableReady = false;

/** 幂等建表（首次调用执行一次） */
function ensureTable(): void {
  if (tableReady) return;
  const db = getAuthDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      username TEXT NOT NULL,
      ip TEXT,
      login_result TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_log_created_at ON login_log(created_at DESC)');
  tableReady = true;
}

/**
 * 写入一条登录日志
 * @param input traceId / 脱敏用户名 / IP / 登录结果
 */
export function saveLoginLog(input: LoginLogInput): void {
  ensureTable();
  const db = getAuthDb();
  db.prepare(
    'INSERT INTO login_log (trace_id, username, ip, login_result, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(input.traceId, input.username, input.ip, input.loginResult, new Date().toISOString());
}

/** 查询最近的登录日志（按时间倒序，验收/排查用） */
export function listLoginLogs(limit = 20): LoginLogRow[] {
  ensureTable();
  const db = getAuthDb();
  return db
    .prepare('SELECT * FROM login_log ORDER BY id DESC LIMIT ?')
    .all(limit) as LoginLogRow[];
}
