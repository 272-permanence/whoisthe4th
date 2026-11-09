/**
 * @file traceId 中间件（全链路追踪）
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description
 *  1. 优先取请求头 X-Trace-Id（前端已有则沿用），没有则生成 UUID
 *  2. 挂到 req.traceId，后续中间件/服务可通过 req.traceId 或 getTraceId() 获取
 *  3. 写回响应头 X-Trace-Id，前端/网关可回读
 *  4. 存入 AsyncLocalStorage，后续所有日志自动带 traceId，无需手动透传
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithTrace } from '../common/logger.js';

declare global {
  namespace Express {
    interface Request {
      /** 本次请求的全链路追踪 ID */
      traceId?: string;
    }
  }
}

const TRACE_HEADER = 'x-trace-id';

/** traceId 中间件：必须挂在所有中间件与业务路由之前 */
export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers[TRACE_HEADER];
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  const traceId = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();

  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);

  // 在该 traceId 的异步上下文中继续执行后续中间件
  runWithTrace(traceId, () => next());
}
