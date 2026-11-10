/**
 * @file 鉴权守卫（本地占位版）
 * @description
 *   本文件为成员 D 在 C 的共享鉴权中间件（backend/src/middleware/auth.ts）
 *   落地前的临时可运行实现。约定接口与 C 保持一致：
 *     - requireAuth   校验登录态，未登录返回 401
 *     - requireRole(roles)  校验角色，越权返回 403
 *
 *   TODO（C 接管后）：
 *     1. 将本文件的逻辑迁移到 backend/src/middleware/auth.ts
 *     2. 改为基于 JWT 的鉴权（解析 Authorization: Bearer <token>）
 *     3. requireRole 从 token payload 取 role，与 admin_user.role 对齐
 *     4. logs.ts / analytics/routes.ts 中的 import 路径改为 ../middleware/auth.js
 *
 *   当前临时实现：
 *     - Authorization: Bearer <任意非空> 视为已登录
 *     - 角色从请求头 x-user-role 读取（admin / operator），缺省为 operator
 */

import type { Request, Response, NextFunction } from 'express';
import { ErrorCodeEnum } from '../common/errorCodes.js';

/** 已认证用户信息（挂载到 req 上） */
export interface AuthUser {
  userId: number;
  username: string;
  role: string;
}

// 注意：不再声明 global Express.Request.user，避免与 C 的 middleware/auth.ts 类型冲突
// 使用本守卫时通过类型断言访问 req.user as AuthUser

/**
 * 登录校验中间件
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 40101, message: '未登录或登录已过期' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ code: 40101, message: '未登录或登录已过期' });
    return;
  }

  // 临时：从 token 中解析用户信息（C 接 JWT 后替换）
  // token 格式约定：<userId>:<username>:<role>，如 "1:admin:admin"
  // 也兼容纯 token（此时 userId=0, role 从 x-user-role 取）
  const roleHeader = (req.headers['x-user-role'] as string) || 'operator';
  let userId = 0;
  let username = 'unknown';
  let role = roleHeader;

  const parts = token.split(':');
  if (parts.length >= 3) {
    userId = Number(parts[0]) || 0;
    username = parts[1] || 'unknown';
    role = parts[2] || roleHeader;
  }

  (req as unknown as { user: AuthUser }).user = { userId, username, role };
  next();
}

/**
 * 角色校验中间件工厂
 * @param roles 允许的角色列表
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as unknown as { user: AuthUser }).user;
    if (!user) {
      res.status(401).json({ code: 40101, message: '未登录或登录已过期' });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ code: ErrorCodeEnum.NOT_FOUND, message: '无权限访问该资源' });
      return;
    }
    next();
  };
}
