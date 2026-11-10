/**
 * @file traceId 中间件（成员D）
 * @author 第八组（成员D）
 * @date 2026-11-10
 * @description
 *   为每个请求确定一个 traceId，并写入响应头 X-Trace-Id：
 *     1) 请求头带 X-Trace-Id 且合法 → 沿用（前端全链路传递的核心）
 *     2) 没带 / 非法 → 后端生成一个 UUID
 *   前端 apiClient 会把响应头里的 X-Trace-Id 回写 localStorage，
 *   因此「登录 → 点景点 → 导航 → 出错」全程共用同一个 traceId。
 *   注意：CORS 必须 exposeHeaders 这个头，否则浏览器读不到（见 app.ts）。
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** 响应头名，前端 apiClient / track 工具以此为准 */
export const TRACE_ID_HEADER = 'X-Trace-Id';

/** traceId 最大长度，与数据库 trace_id VARCHAR(64) 对齐 */
const MAX_TRACE_ID_LENGTH = 64;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 本次请求的链路追踪 ID，由 traceIdMiddleware 注入 */
      traceId?: string;
    }
  }
}

/**
 * 归一化请求头里的 traceId：去空白、限制长度、只保留安全字符
 * @param raw 原始请求头值
 * @returns 合法 traceId，非法时返回 null
 */
function normalizeTraceId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_TRACE_ID_LENGTH) return null;
  // 只允许字母数字和 - _ . ，防止日志注入
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * traceId 中间件：确定 traceId 并写入 req.traceId + 响应头
 */
export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = normalizeTraceId(req.headers[TRACE_ID_HEADER.toLowerCase()]) ?? randomUUID();
  req.traceId = traceId;
  res.setHeader(TRACE_ID_HEADER, traceId);
  next();
}
