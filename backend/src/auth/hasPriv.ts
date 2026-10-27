/**
 * @file Express 权限中间件：hasPriv(module, method)
 * @author 第八组（成员C）
 * @date 2026-10-27
 * @description 对应禅道 framework/entry.class.php 的 checkPriv()：
 *              每个请求进入业务逻辑前，先校验「当前账号是否拥有 module:method 权限」，
 *              无权限直接 403，不进入控制器。
 *
 *              账号来源：登录体系（任务三后续）建成前，暂时从 x-account 请求头读取，
 *              与 analytics 模块的 userId 约定一致；接入登录后只需替换 resolveAccount()。
 *
 *              用法：
 *                import { hasPriv } from '../auth/hasPriv.js';
 *                router.post('/documents', hasPriv('kb', 'upload'), uploadHandler);
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ErrorCodeEnum } from '../constants/errorCodes.js';
import { HttpError } from '../utils/httpError.js';
import { authorize, checkPriv } from './rbacService.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('hasPriv');

/**
 * 从请求中解析当前账号。登录体系接入前读 x-account 头。
 * @returns 账号字符串；未提供时返回 null
 */
function resolveAccount(req: Request): string | null {
  const account = req.header('x-account');
  return account && account.trim() !== '' ? account.trim() : null;
}

/**
 * 权限中间件工厂：生成「要求 module:method 权限」的 Express 中间件
 * @param module 模块名，如 'kb'、'analytics'（大小写不敏感，内部统一转小写）
 * @param method 操作名，如 'upload'、'view'
 */
export function hasPriv(module: string, method: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const account = resolveAccount(req);
      if (!account) {
        throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '缺少 x-account 请求头，请先登录');
      }
      const ctx = await authorize(account);
      // 对应禅道：$app->user->admin 短路 / commonModel::hasPriv 查内存权限表
      if (!checkPriv(ctx, module, method)) {
        log.WARN(`越权拦截 account=${account} 请求 ${module}:${method}`);
        throw new HttpError(403, ErrorCodeEnum.FORBIDDEN, `无权限执行 ${module}:${method}`);
      }
      next();
    } catch (err) {
      next(err); // 交给 app.ts 的统一错误处理中间件
    }
  };
}
