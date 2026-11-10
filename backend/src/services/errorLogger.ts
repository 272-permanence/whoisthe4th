/**
 * @file 后端错误日志封装（B 专属，全组共用）
 * @description 统一错误日志格式，每次错误必须带 traceId + errorType + errorCode + stack。
 *              内部用 Pino 写文件（logger.ts 的 JSON 结构化日志），同时异步调用
 *              D 负责的 saveErrorLog() 存数据库。数据库写入**绝对不阻塞**主流程。
 * @author 第八组（成员B）
 * @date 2026-11-09
 */
import type { Request } from 'express';
import { getLoggerInstance } from '../common/logger.js';
import { HttpError } from '../utils/httpError.js';
import type { ErrorCode } from '../constants/errorCodes.js';

/** 错误分类 */
export type ErrorType = 'business' | 'system' | 'dependency';

/** 一次错误日志的字段（和 D 的 error_log 表严格对齐） */
export interface ErrorLogPayload {
  /** 全链路 traceId（从 C 的 traceId 中间件注入到 req.traceId） */
  traceId: string;
  /** 错误类型：business（业务校验失败）/ system（代码 bug）/ dependency（外部依赖如高德/MySQL 超时） */
  errorType: ErrorType;
  /** 错误码（从 HttpError.code 拿，比如 INVALID_PARAM / INTERNAL_ERROR） */
  errorCode?: ErrorCode;
  /** 错误堆栈 */
  stack?: string;
  /** 触发错误的 Express 路由，比如 /api/v1/poi/:id */
  route?: string;
  /** 触发错误的 service 名称，比如 poiService.getPoiById */
  service?: string;
  /** 关联用户 ID（JWT 里的 req.user?.id，nullable） */
  userId?: number;
  /** 额外上下文（调试信息） */
  context?: Record<string, unknown>;
}

/**
 * 统一错误日志入口
 * @param err 捕获到的错误（可以是 HttpError，也可以是原生 Error）
 * @param req Express Request 对象（可选，用来拿 traceId / userId / route）
 * @param extra 额外字段：errorType / service / context 等手动指定
 */
export function logError(
  err: unknown,
  req?: Request,
  extra: Partial<ErrorLogPayload> = {}
): void {
  const pino = getLoggerInstance();
  const error = err instanceof Error ? err : new Error(String(err));

  // 从 HttpError 里拿 errorCode
  const code = err instanceof HttpError ? err.code : undefined;

  // 构建日志 payload
  const payload: ErrorLogPayload = {
    traceId: (req as Request & { traceId?: string } | undefined)?.traceId ?? 'no-trace-id',
    errorType: extra.errorType ?? inferErrorType(err),
    errorCode: extra.errorCode ?? code,
    stack: error.stack,
    route: extra.route ?? req?.path,
    service: extra.service,
    userId: (req as Request & { user?: { id?: number } } | undefined)?.user?.id,
    context: extra.context
  };

  // 1. Pino 写 JSON 到文件（开发环境 pino-pretty 也会打 console）
  pino.error(payload, error.message);

  // 2. 异步存数据库（D 负责实现的 saveErrorLog，动态导入避免 D 没写就崩）
  void saveToDatabase(payload).catch((dbErr: unknown) => {
    pino.warn({ dbError: dbErr instanceof Error ? dbErr.message : dbErr }, '错误日志写入数据库失败（Pino 文件日志已兜底）');
  });
}

/**
 * 推断错误类型（给 errorType 字段默认值）
 * - HttpError 带 errorCode 且不是 5xx → business
 * - HttpError 带 errorCode 且是 5xx → system
 * - 其他 → dependency（MySQL/高德等外部依赖超时属于这类）
 */
function inferErrorType(err: unknown): ErrorType {
  if (err instanceof HttpError) {
    if (err.status >= 500) return 'system';
    return 'business';
  }
  // 常见外部依赖错误关键词
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('fetch') || msg.includes('timeout') || msg.includes('connect') || msg.includes('econnrefused')) {
    return 'dependency';
  }
  return 'system';
}

/**
 * 异步写入数据库（D 负责实现，这里用动态导入兜底）
 * 设计约束：**绝对不阻塞**主流程，数据库崩了不影响响应
 */
async function saveToDatabase(payload: ErrorLogPayload): Promise<void> {
  try {
    // 动态导入：D 写完 service/logService.ts 后这里就能直接用
    const logService = await import('../services/logService.js');
    await logService.saveErrorLog({
      trace_id: payload.traceId,
      error_type: payload.errorType,
      error_code: payload.errorCode != null ? String(payload.errorCode) : null,
      stack: payload.stack ?? null,
      route: payload.route ?? null,
      service: payload.service ?? null,
      user_id: payload.userId ?? null,
      context: payload.context ? JSON.stringify(payload.context) : null
    });
  } catch (importErr) {
    // D 还没写 logService → 静默跳过，Pino 文件日志已经兜底
    const pino = getLoggerInstance();
    pino.debug({ importError: importErr instanceof Error ? importErr.message : importErr }, 'logService 未就绪，跳过错误日志数据库写入');
  }
}
