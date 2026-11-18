/**
 * @file 认证中间件：全局 JWT 解析 + 账号锁定检查 + 角色校验
 * @author 第八组（成员C）
 * @date 2026-11-18
 * @change 新增账号锁定检查 + 用户 disabled 状态实时校验
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload, isAccountLocked, getUserById } from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      /** 账号锁定剩余毫秒（authMiddleware 填充，供后续路由参考） */
      accountLockedMs?: number;
    }
  }
}

/**
 * 全局 JWT 解析中间件（不强制登录）
 * 有合法 token 则填充 req.user，供后续中间件/路由复用；无 token 或 token 无效直接放行。
 * 强制登录与角色校验仍由各路由内的 requireAuth / requireRole 完成。
 *
 * 11-18 新增：token 合法但账号被锁/被禁用 → 填充 req.accountLockedMs 或跳过 req.user，
 *          避免 disable 状态的用户拿着旧 token 继续操作。
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      const payload = verifyToken(token);

      // 账号锁定检查（内存 Map，连续 5 次密码错 → 15 分钟锁）
      const lockedMs = isAccountLocked(payload.username);
      if (lockedMs > 0) {
        req.accountLockedMs = lockedMs;
        // 不放行 req.user，让 requireAuth 看到 req.user 为空后抛 423
        next();
        return;
      }

      // 用户 disabled 状态实时校验（防止管理员禁用后旧 token 继续有效）
      const fresh = getUserById(payload.uid);
      if (!fresh) {
        // 用户已被删除
        next();
        return;
      }
      if (fresh.status === 'disabled') {
        // 账号被禁用，不放行 req.user
        next();
        return;
      }

      req.user = payload;
    } catch {
      // token 无效时放行，交由 requireAuth 统一抛出 401
    }
  }
  next();
}

/** 必须登录：token 合法 + 账号未锁 + 账号未禁用，否则 401 / 423 / 403 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  // 账号锁定优先返回 423（让前端展示"账号已被锁定 X 分钟"）
  if (req.accountLockedMs && req.accountLockedMs > 0) {
    const retryAfterSec = Math.ceil(req.accountLockedMs / 1000);
    _res.setHeader('Retry-After', String(retryAfterSec));
    throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `账号已被锁定，请 ${retryAfterSec} 秒后再试`);
  }

  if (!req.user) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '缺少 Authorization: Bearer <token>');
    }
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, 'token 无效或已过期');
    }
  }
  next();
}

/** 必须具备指定角色（需先经过 requireAuth） */
export function requireRole(role: JwtPayload['role']) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '未登录');
    if (req.user.role !== role) {
      throw new HttpError(403, ErrorCodeEnum.FORBIDDEN, `需要 ${role} 角色`);
    }
    next();
  };
}

/** 必须是 admin 角色（快捷别名，一次创建复用） */
export const requireAdmin = requireRole('admin');
