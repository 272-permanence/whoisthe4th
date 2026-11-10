/**
 * @file 日志查询路由（成员D · 数据洞察）
 * @description 提供 error_log / operation_log / login_log 的分页查询与全链路追踪接口。
 *              所有接口仅限管理员访问（requireAuth + requireRole(['admin'])）。
 *
 *   GET /api/v1/logs/operation   分页查操作日志
 *   GET /api/v1/logs/error       分页查错误日志
 *   GET /api/v1/logs/login       分页查登录日志
 *   GET /api/v1/logs/trace/:traceId  按 traceId 查全链路（串联三类日志）
 */

import { Router, type Request, type Response } from 'express';
import { executeRead } from '../analytics/db.js';
import { createLogger } from '../common/logger.js';
import { requireAuth, requireRole } from './authGuard.js';

const log = createLogger('logs');
const router = Router();

// 全部接口都需要管理员权限
router.use(requireAuth, requireRole(['admin']));

// ============================ 工具函数 ============================

/** 解析分页参数 */
function parsePagination(req: Request): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 解析时间范围（start / end，ISO 字符串或 YYYY-MM-DD HH:mm:ss） */
function parseTimeRange(req: Request): { start?: string; end?: string } {
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;
  return { start: start?.trim() || undefined, end: end?.trim() || undefined };
}

/** 拼接时间范围 WHERE 条件 */
function buildTimeCondition(
  start?: string,
  end?: string,
  field = 'created_at'
): { sql: string; params: (string | number)[] } {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (start) {
    parts.push(`${field} >= ?`);
    params.push(start);
  }
  if (end) {
    parts.push(`${field} <= ?`);
    params.push(end);
  }
  return { sql: parts.length ? parts.join(' AND ') : '1=1', params };
}

// ============================ 操作日志 ============================

/**
 * GET /api/v1/logs/operation
 * 分页查操作日志
 * query: traceId, userId, apiPath, method, start, end, page, pageSize
 */
router.get('/operation', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const { start, end } = parseTimeRange(req);
    const traceId = (req.query.traceId as string)?.trim();
    const userId = req.query.userId as string | undefined;
    const apiPath = (req.query.apiPath as string)?.trim();
    const method = (req.query.method as string)?.trim();

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (traceId) { where.push('trace_id = ?'); params.push(traceId); }
    if (userId) { where.push('user_id = ?'); params.push(Number(userId)); }
    if (apiPath) { where.push('api_path LIKE ?'); params.push(`%${apiPath}%`); }
    if (method) { where.push('http_method = ?'); params.push(method.toUpperCase()); }

    const timeCond = buildTimeCondition(start, end);
    where.push(timeCond.sql);
    params.push(...timeCond.params);

    const whereSql = where.join(' AND ');

    const [countRow] = await executeRead<{ total: number }[]>(
      `SELECT COUNT(*) as total FROM operation_log WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.total ?? 0);

    const rows = await executeRead<Record<string, unknown>[]>(
      `SELECT * FROM operation_log WHERE ${whereSql}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        list: rows,
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    log.ERROR(`查询操作日志失败: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '查询操作日志失败' });
  }
});

// ============================ 错误日志 ============================

/**
 * GET /api/v1/logs/error
 * 分页查错误日志
 * query: traceId, errorType, start, end, page, pageSize
 */
router.get('/error', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const { start, end } = parseTimeRange(req);
    const traceId = (req.query.traceId as string)?.trim();
    const errorType = (req.query.errorType as string)?.trim();

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (traceId) { where.push('trace_id = ?'); params.push(traceId); }
    if (errorType) { where.push('error_type = ?'); params.push(errorType); }

    const timeCond = buildTimeCondition(start, end);
    where.push(timeCond.sql);
    params.push(...timeCond.params);

    const whereSql = where.join(' AND ');

    const [countRow] = await executeRead<{ total: number }[]>(
      `SELECT COUNT(*) as total FROM error_log WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.total ?? 0);

    const rows = await executeRead<Record<string, unknown>[]>(
      `SELECT * FROM error_log WHERE ${whereSql}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: { list: rows, total, page, pageSize },
    });
  } catch (error) {
    log.ERROR(`查询错误日志失败: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '查询错误日志失败' });
  }
});

// ============================ 登录日志 ============================

/**
 * GET /api/v1/logs/login
 * 分页查登录日志
 * query: username, loginResult, start, end, page, pageSize
 */
router.get('/login', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const { start, end } = parseTimeRange(req);
    const username = (req.query.username as string)?.trim();
    const loginResult = (req.query.loginResult as string)?.trim();

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (username) { where.push('username LIKE ?'); params.push(`%${username}%`); }
    if (loginResult) { where.push('login_result = ?'); params.push(loginResult); }

    const timeCond = buildTimeCondition(start, end);
    where.push(timeCond.sql);
    params.push(...timeCond.params);

    const whereSql = where.join(' AND ');

    const [countRow] = await executeRead<{ total: number }[]>(
      `SELECT COUNT(*) as total FROM login_log WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.total ?? 0);

    const rows = await executeRead<Record<string, unknown>[]>(
      `SELECT * FROM login_log WHERE ${whereSql}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: { list: rows, total, page, pageSize },
    });
  } catch (error) {
    log.ERROR(`查询登录日志失败: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '查询登录日志失败' });
  }
});

// ============================ 全链路追踪 ============================

/**
 * GET /api/v1/logs/trace/:traceId
 * 按 traceId 串联三类日志（操作 + 错误 + 登录），按时间排序返回完整链路
 */
router.get('/trace/:traceId', async (req: Request, res: Response) => {
  try {
    const traceId = req.params.traceId?.trim();
    if (!traceId) {
      res.status(400).json({ code: 40001, message: 'traceId 不能为空' });
      return;
    }

    const [operations, errors, logins] = await Promise.all([
      executeRead<Record<string, unknown>[]>(
        `SELECT * FROM operation_log WHERE trace_id = ? ORDER BY created_at ASC`,
        [traceId]
      ),
      executeRead<Record<string, unknown>[]>(
        `SELECT * FROM error_log WHERE trace_id = ? ORDER BY created_at ASC`,
        [traceId]
      ),
      executeRead<Record<string, unknown>[]>(
        `SELECT * FROM login_log WHERE trace_id = ? ORDER BY created_at ASC`,
        [traceId]
      ),
    ]);

    // 合并后按 created_at 排序
    type TimelineItem = Record<string, unknown> & { log_type: string };
    const timeline: TimelineItem[] = [
      ...operations.map((r) => ({ ...r, log_type: 'operation' } as TimelineItem)),
      ...errors.map((r) => ({ ...r, log_type: 'error' } as TimelineItem)),
      ...logins.map((r) => ({ ...r, log_type: 'login' } as TimelineItem)),
    ].sort((a, b) => {
      const ta = new Date(a.created_at as string).getTime();
      const tb = new Date(b.created_at as string).getTime();
      return ta - tb;
    });

    res.json({
      code: 0,
      message: 'ok',
      data: {
        traceId,
        operationCount: operations.length,
        errorCount: errors.length,
        loginCount: logins.length,
        timeline,
      },
    });
  } catch (error) {
    log.ERROR(`全链路查询失败 trace=${req.params.traceId}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '全链路查询失败' });
  }
});

export default router;
