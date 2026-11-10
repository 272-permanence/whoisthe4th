/**
 * @file 日志系统 · 路由（成员D · 数据洞察）
 * @description 挂载在 /api/v1/logs，包含前端埋点上报与日志查询两部分：
 *
 *   【埋点上报 · 公开接口（放在管理员守卫之前）】
 *   POST /api/v1/logs/operation   前端 trackClick 埋点（映射到 operation_log）
 *   POST /api/v1/logs/error       前端 trackError 错误上报（映射到 error_log）
 *
 *   【日志查询 · 仅限管理员（requireAuth + requireRole(['admin'])）】
 *   GET /api/v1/logs/operation    分页查操作日志
 *   GET /api/v1/logs/error        分页查错误日志
 *   GET /api/v1/logs/login        分页查登录日志
 *   GET /api/v1/logs/trace/:traceId  按 traceId 查全链路（串联三类日志）
 */

import { Router, type Request, type Response } from 'express';
import { executeRead } from '../analytics/db.js';
import { ErrorCodeEnum } from '../common/errorCodes.js';
import { createLogger } from '../common/logger.js';
import { saveErrorLog, saveOperationLog } from '../services/logService.js';
import { requireAuth, requireRole } from './authGuard.js';

const log = createLogger('logs');
const router = Router();

// ============================ 埋点上报（公开，无鉴权） ============================
// 前端 utils/track.ts 用裸 fetch 上报（best-effort 旁路请求，不带 token），
// 因此这两个 POST 必须注册在管理员权限守卫之前。
// 字段对齐前端 TrackLogPayload，映射到本组 3 表结构（trace_id 贯穿全链路）。

/** 截断字符串，超长返回 null 视为非法 */
function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/** 上限常量，防异常超大 payload */
const MAX_TEXT = 512;
const MAX_PATH = 256;
const MAX_ID = 128;

// POST /operation：前端点击埋点 → operation_log
router.post('/operation', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const resourceId = clip(body.resourceId, MAX_ID);
    const resourceType = clip(body.resourceType, MAX_ID);
    if (resourceId === null || resourceType === null) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'resourceId / resourceType 不能为空' });
      return;
    }
    const action = clip(body.action, 32) ?? 'click';
    const pagePath = clip(body.pagePath, MAX_PATH) ?? '/';

    // 写入队列（Redis 不可用时内部自动降级直写 MySQL），失败不影响响应
    await saveOperationLog({
      trace_id: req.traceId ?? 'unknown',
      user_id: typeof body.userId === 'number' || typeof body.userId === 'string' ? Number(body.userId) || null : null,
      api_path: pagePath,
      http_method: 'CLICK',
      request_params: {
        action,
        resourceType,
        resourceId,
        client_ts: Number(body.timestamp) || Date.now(),
        ...(body.extra && typeof body.extra === 'object' ? body.extra : {})
      } as Record<string, unknown>,
      response_code: 200,
      ip: req.ip ?? null,
      user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null
    });

    res.json({ code: 0, message: 'ok', data: { accepted: true } });
  } catch (error) {
    log.ERROR(`埋点操作日志写入失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '操作日志写入失败' });
  }
});

// POST /error：前端 JS 错误上报 → error_log
router.post('/error', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errorMessage = clip(body.errorMessage, MAX_TEXT);
    if (errorMessage === null) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'errorMessage 必填' });
      return;
    }
    const errorName = clip(body.errorName, 64) ?? 'Error';
    const pagePath = clip(body.pagePath, MAX_PATH) ?? '/';

    await saveErrorLog({
      trace_id: req.traceId ?? 'unknown',
      error_type: 'system',
      error_code: errorName,
      stack: clip(body.stack, 4096),
      route: pagePath,
      service: clip(body.source, 64) ?? 'frontend',
      user_id: typeof body.userId === 'number' || typeof body.userId === 'string' ? Number(body.userId) || null : null
    });

    res.json({ code: 0, message: 'ok', data: { accepted: true } });
  } catch (error) {
    log.ERROR(`埋点错误日志写入失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '错误日志写入失败' });
  }
});

// ============================ 日志查询（管理员） ============================

// 以下查询接口都需要管理员权限
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
