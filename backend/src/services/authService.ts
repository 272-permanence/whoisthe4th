/**
 * @file 认证服务：JWT 签发/校验 + bcryptjs 密码哈希
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getAuthDb } from './authDb.js';
import { config } from '../config.js';

export interface JwtPayload {
  uid: number;
  username: string;
  role: 'admin' | 'user';
}

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

/** 签发 JWT */
export function signToken(payload: JwtPayload): string {
  // jsonwebtoken 的 SignOptions 类型在严格模式下对 expiresIn 字面量推断有问题，any 兜底
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
}

/** 校验 JWT，无效抛异常 */
export function verifyToken(token: string): JwtPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.verify as any)(token, config.jwt.secret) as JwtPayload;
}

/** 登录：校验密码并返回用户 + token */
export function login(username: string, password: string): { user: Omit<UserRecord, 'password_hash'>; token: string } | null {
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM admin_user WHERE username = ?').get(username) as UserRecord | undefined;
  if (!user) return null;

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return null;

  const payload: JwtPayload = { uid: user.id, username: user.username, role: user.role };
  const token = signToken(payload);
  const { password_hash: _omit, ...safeUser } = user;
  return { user: safeUser, token };
}

/** 注册（仅 admin 或开放注册均可调用，实际由路由控制） */
export function register(
  username: string,
  password: string,
  role: 'admin' | 'user' = 'user',
  nickname?: string
): { id: number } | { error: string } {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
  if (existing) return { error: 'USERNAME_EXISTS' };

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      'INSERT INTO admin_user (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)'
    )
    .run(username, hash, role, nickname ?? null);
  return { id: Number(result.lastInsertRowid) };
}

/** 根据 uid 获取用户（排除密码） */
export function getUserById(uid: number): Omit<UserRecord, 'password_hash'> | null {
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM admin_user WHERE id = ?').get(uid) as UserRecord | undefined;
  if (!user) return null;
  const { password_hash: _omit, ...safe } = user;
  return safe;
}
