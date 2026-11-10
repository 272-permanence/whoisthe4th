/**
 * @file 日志系统 · 路由（成员D）
 * @author 第八组（成员D）
 * @date 2026-11-10
 * @description
 *   前端埋点统一入口，挂载在 /api/v1/logs：
 *     POST /operation            写入操作日志（点击/交互）
 *     POST /error                写入错误日志（JS 运行时错误）
 *     GET  /operation?traceId=&resourceType=&limit=   查询操作日志（验收/排障用）
 *     GET  /error?traceId=&source=&limit=             查询错误日志
 *     GET  /trace/:traceId       按 traceId 聚合查询（一次看完整链路）
 *   所有响应遵循全组统一的 { code, message, data } 结构。
 */
import { Router, type Request, type Response } from 'express';
import { ErrorCodeEnum } from '../common/errorCodes.js';
import { createLogger } from '../common/logger.js';
import {
  insertErrorLog,
  insertOperationLog,
  queryErrorLogs,
  queryOperationLogs,
} from '../services/logService.js';

const log = createLogger('logs');
const router = Router();

/** 字段长度上限，与 03_log_schema.sql 的列定义对齐 */
const MAX_ACTION = 64;
const MAX_RESOURCE_TYPE = 64;
const MAX_RESOURCE_ID = 128;
const MAX_PAGE_PATH = 255;
const MAX_TRACE_ID = 64;
const MAX_ERROR_NAME = 128;
const MAX_SOURCE = 64;
const MAX_USER_ID = 64;
/** 堆栈与错误信息体积上限，防止超大 payload 撑爆表 */
const MAX_TEXT = 20_000;
/** 单次查询条数上限 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** 按列宽截断字符串 */
function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * 把请求体里的 extra 归一化为对象
 * 支持前端直接传对象，也兼容传 JSON 字符串
 */
function normalizeExtra(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * 解析并收敛查询条数
 */
function parseLimit(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * 确定本次上报的 traceId：优先用请求头注入的（中间件保证一定存在），
 * 其次用 body 里带的，最后兜底 unknown。
 */
function resolveTraceId(req: Request, bodyTraceId: unknown): string {
  return clip(bodyTraceId, MAX_TRACE_ID) ?? req.traceId ?? 'unknown';
}

// ======================== POST /operation ========================

router.post('/operation', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = clip(body.action, MAX_ACTION);
    const resourceType = clip(body.resourceType, MAX_RESOURCE_TYPE);
    const resourceId = clip(body.resourceId, MAX_RESOURCE_ID);

    if (action === null || resourceType === null || resourceId === null) {
      res.status(400).json({
        code: ErrorCodeEnum.INVALID_PARAM,
        message: 'action / resourceType / resourceId 均为必填',
      });
      return;
    }

    const clientTs = Number(body.timestamp);
    const id = await insertOperationLog({
      traceId: resolveTraceId(req, body.traceId),
      action,
      resourceType,
      resourceId,
      pagePath: clip(body.pagePath, MAX_PAGE_PATH),
      userId: clip(body.userId, MAX_USER_ID),
      clientTs: Number.isFinite(clientTs) ? clientTs : null,
      extra: normalizeExtra(body.extra),
    });

    res.json({ code: 0, message: 'ok', data: { id } });
  } catch (error) {
    log.ERROR(`操作日志写入失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '操作日志写入失败' });
  }
});

// ======================== POST /error ========================

router.post('/error', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errorName = clip(body.errorName, MAX_ERROR_NAME) ?? 'Error';
    const errorMessage = clip(body.errorMessage, MAX_TEXT);

    if (errorMessage === null) {
      res.status(400).json({
        code: ErrorCodeEnum.INVALID_PARAM,
        message: 'errorMessage 必填',
      });
      return;
    }

    const clientTs = Number(body.timestamp);
    const id = await insertErrorLog({
      traceId: resolveTraceId(req, body.traceId),
      errorName,
      errorMessage,
      stackTrace: clip(body.stack, MAX_TEXT),
      pagePath: clip(body.pagePath, MAX_PAGE_PATH),
      source: clip(body.source, MAX_SOURCE),
      userId: clip(body.userId, MAX_USER_ID),
      clientTs: Number.isFinite(clientTs) ? clientTs : null,
      extra: normalizeExtra(body.extra),
    });

    res.json({ code: 0, message: 'ok', data: { id } });
  } catch (error) {
    log.ERROR(`错误日志写入失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '错误日志写入失败' });
  }
});

// ======================== GET /operation ========================

router.get('/operation', async (req: Request, res: Response) => {
  try {
    const rows = await queryOperationLogs({
      traceId: clip(req.query.traceId, MAX_TRACE_ID) ?? undefined,
      resourceType: clip(req.query.resourceType, MAX_RESOURCE_TYPE) ?? undefined,
      limit: parseLimit(req.query.limit),
    });
    res.json({ code: 0, message: 'ok', data: rows });
  } catch (error) {
    log.ERROR(`操作日志查询失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '操作日志查询失败' });
  }
});

// ======================== GET /error ========================

router.get('/error', async (req: Request, res: Response) => {
  try {
    const rows = await queryErrorLogs({
      traceId: clip(req.query.traceId, MAX_TRACE_ID) ?? undefined,
      source: clip(req.query.source, MAX_SOURCE) ?? undefined,
      limit: parseLimit(req.query.limit),
    });
    res.json({ code: 0, message: 'ok', data: rows });
  } catch (error) {
    log.ERROR(`错误日志查询失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '错误日志查询失败' });
  }
});

// ======================== GET /trace/:traceId ========================

router.get('/trace/:traceId', async (req: Request, res: Response) => {
  try {
    const traceId = clip(req.params.traceId, MAX_TRACE_ID);
    if (traceId === null) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'traceId 无效' });
      return;
    }

    const limit = parseLimit(req.query.limit);
    const [operations, errors] = await Promise.all([
      queryOperationLogs({ traceId, limit }),
      queryErrorLogs({ traceId, limit }),
    ]);

    res.json({
      code: 0,
      message: 'ok',
      data: { traceId, operationLogs: operations, errorLogs: errors },
    });
  } catch (error) {
    log.ERROR(`链路查询失败 traceId=${req.params.traceId}: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '链路查询失败' });
  }
});

export default router;
