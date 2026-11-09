/**
 * @file 操作日志中间件
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 自动记录所有进入后端的请求：方法、路径、状态码、耗时、IP、traceId。
 *              响应结束（finish）时落一条 INFO 日志；异常中断（close 且未 finish）记 WARN。
 */
import type { NextFunction, Request, Response } from 'express';
import { createLogger } from '../common/logger.js';
import { clientIp } from '../utils/ip.js';

const logger = createLogger('operation');

/** 操作日志中间件：需挂在 traceIdMiddleware 之后、业务路由之前 */
export function operationLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startAt = Date.now();
  // 在注册时捕获 traceId，避免 EventEmitter 回调丢失 AsyncLocalStorage 上下文
  const traceId = req.traceId ?? '-';
  let finished = false;

  res.on('finish', () => {
    finished = true;
    const cost = Date.now() - startAt;
    logger.INFO(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${cost}ms ip=${clientIp(req)} trace=${traceId}`
    );
  });

  res.on('close', () => {
    if (finished) return;
    const cost = Date.now() - startAt;
    logger.WARN(
      `${req.method} ${req.originalUrl} 连接中断 ${cost}ms ip=${clientIp(req)} trace=${traceId}`
    );
  });

  next();
}
