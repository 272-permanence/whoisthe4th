/**
 * @file 后端操作日志中间件（B 专属，C 负责挂载到 app.ts）
 * @description 自动记录所有 `/api/v1/*` 请求（除登录/刷新 token/日志接口自身），
 *              字段与 D 的 operation_log 表严格对齐：traceId + userId + apiPath + method +
 *              脱敏后的请求参数 + 响应码 + 耗时 + IP + UserAgent。
 *              异步写入，**绝对不阻塞**主流程。
 * @author 第八组（成员B）
 * @date 2026-11-09
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getLoggerInstance } from '../common/logger.js';
import { maskParams } from '../utils/mask.js';

/** 跳过操作日志的路径前缀（避免登录密码重复记录、无限递归记录日志写入接口） */
const SKIP_PATH_PREFIXES = [
  '/api/v1/auth/login',      // C 负责在 auth 路由里单独写登录日志
  '/api/v1/auth/refresh',    // refresh token 不记录
  '/api/v1/logs',            // 日志查询接口本身不记录
  '/health',                 // 健康检查不记录
  '/api/v1/auth/register'    // 注册接口不记录（C 的登录日志会覆盖）
] as const;

const router = Router();

/**
 * 操作日志中间件工厂
 * C 挂载方式：
 *   app.use(operationLogMiddleware);  // 放在 traceIdMiddleware 之后、auth 之前、所有业务路由之前
 */
export const operationLogMiddleware = router.use((req, res, next) => {
  // 1. 跳过不需要记录的路径
  if (SKIP_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  const startAt = Date.now();
  const pino = getLoggerInstance();

  // 2. 在响应发送完成时记录（此时 res.statusCode 已确定）
  res.on('finish', async () => {
    const durationMs = Date.now() - startAt;

    // 3. 收集日志字段
    const traceId = (req as Request & { traceId?: string }).traceId ?? 'no-trace-id';
    // C 的 JwtPayload 用 uid，兼容部分路由挂载的 user.id
    const authUser = (req as Request & { user?: { uid?: number; id?: number } }).user;
    const userId = authUser?.uid ?? authUser?.id ?? null;

    const apiPath = req.path;
    const httpMethod = req.method;
    const responseCode = res.statusCode;
    const ip = req.ip ?? req.socket.remoteAddress ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    // 请求参数脱敏：合并 query + body + params，统一 mask
    const rawParams: Record<string, unknown> = {};
    if (req.query && Object.keys(req.query).length > 0) rawParams.query = req.query;
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) rawParams.body = req.body;
    if (req.params && Object.keys(req.params).length > 0) rawParams.params = req.params;
    const requestParams = maskParams(rawParams); // B 的 mask.ts，敏感字段自动遮盖

    // 4. Pino 也打一条（开发环境能在 console 看到，生产环境 JSON 写文件）
    pino.info(
      { traceId, apiPath, httpMethod, responseCode, durationMs, userId, ip },
      `${httpMethod} ${apiPath} → ${responseCode} (${durationMs}ms)`
    );

    // 5. 异步存数据库（D 负责实现 saveOperationLog，动态导入兜底）
    void saveToDatabase({
      trace_id: traceId,
      user_id: userId,
      api_path: apiPath,
      http_method: httpMethod,
      request_params: requestParams,
      response_code: responseCode,
      duration_ms: durationMs,
      ip,
      user_agent: userAgent
    }).catch((dbErr) => {
      pino.warn({ dbError: dbErr instanceof Error ? dbErr.message : dbErr }, '操作日志写入数据库失败（Pino 文件日志已兜底）');
    });
  });

  next();
});

/** 异步写入数据库（和 errorLogger 一样的动态导入兜底） */
async function saveToDatabase(log: Parameters<typeof import('../services/logService.js').saveOperationLog>[0]): Promise<void> {
  try {
    const logService = await import('../services/logService.js');
    await logService.saveOperationLog(log);
  } catch (importErr) {
    const pino = getLoggerInstance();
    pino.debug(
      { importError: importErr instanceof Error ? importErr.message : importErr },
      'logService 未就绪，跳过操作日志数据库写入'
    );
  }
}

/**
 * 工厂函数（兼容未来需要不同前缀/不同环境的扩展）
 * 当前直接导出单例 router 即可，无需额外调用
 */
export function createOperationLogMiddleware(): NextFunction {
  return operationLogMiddleware as unknown as NextFunction;
}
