/**
 * @file 全局鉴权中间件
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 拦截请求头中的 Bearer Token，校验 JWT 后将用户信息挂载到 req.user。
 *              提供 requireAuth（必须登录）和 requireRole（必须指定角色）两个工厂。
 */
import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type JwtPayload } from '../services/authService.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** 从 Authorization: Bearer xxx 中提取 token */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return null;
}

/** 必须登录（Token 有效即可） */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ code: ErrorCodeEnum.UNAUTHORIZED, message: '未登录，请先登录' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ code: ErrorCodeEnum.UNAUTHORIZED, message: '登录已过期，请重新登录' });
    return;
  }
  req.user = payload;
  next();
}

/**
 * 必须指定角色（工厂函数）
 * @param roles 允许的角色列表，如 ['admin'] 或 ['admin', 'user']
 */
export function requireRole(...roles: Array<JwtPayload['role']>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 先确保登录
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ code: ErrorCodeEnum.UNAUTHORIZED, message: '未登录，请先登录' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ code: ErrorCodeEnum.UNAUTHORIZED, message: '登录已过期，请重新登录' });
      return;
    }
    if (!roles.includes(payload.role)) {
      res.status(403).json({ code: ErrorCodeEnum.FORBIDDEN, message: `需要 ${roles.join('/')} 权限` });
      return;
    }
    req.user = payload;
    next();
  };
}
