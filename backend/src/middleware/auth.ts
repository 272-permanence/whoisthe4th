/**
 * @file 认证中间件：requireAuth / requireRole
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * 全局 JWT 解析中间件（不强制登录）
 * 有合法 token 则填充 req.user，供后续中间件/路由复用；无 token 或 token 无效直接放行。
 * 强制登录与角色校验仍由各路由内的 requireAuth / requireRole 完成。
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      // token 无效时放行，交由 requireAuth 统一抛出 401
    }
  }
  next();
}

/** 必须登录 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '缺少 Authorization: Bearer <token>');
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, 'token 无效或已过期');
  }
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

