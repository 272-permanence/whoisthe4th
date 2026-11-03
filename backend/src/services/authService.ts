/**
 * @file 认证服务：JWT 签发/校验 + bcryptjs 密码哈希 + 用户管理
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getAuthDb } from './authDb.js';
import { config } from '../config.js';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';

export interface JwtPayload {
  uid: number;
  username: string;
  role: UserRole;
}

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  nickname: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<UserRecord, 'password_hash'>;

export function signToken(payload: JwtPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.verify as any)(token, config.jwt.secret) as JwtPayload;
}

export function login(username: string, password: string): { user: SafeUser; token: string } | { error: string } {
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM admin_user WHERE username = ?').get(username) as UserRecord | undefined;
  if (!user) return { error: 'BAD_CREDENTIALS' };
  if (user.status === 'disabled') return { error: 'USER_DISABLED' };
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return { error: 'BAD_CREDENTIALS' };

  const safe = toSafeUser(user);
  const token = signToken({ uid: user.id, username: user.username, role: user.role });
  return { user: safe, token };
}

/** 注册：只允许 user 角色，管理员账号只能由已有管理员添加 */
export function register(username: string, password: string, nickname?: string): { id: number } | { error: string } {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
  if (existing) return { error: 'USERNAME_EXISTS' };
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      'INSERT INTO admin_user (username, password_hash, role, nickname, status) VALUES (?, ?, ?, ?, "active")'
    )
    .run(username, hash, 'user', nickname ?? null);
  return { id: Number(result.lastInsertRowid) };
}

export function getUserById(uid: number): SafeUser | null {
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM admin_user WHERE id = ?').get(uid) as UserRecord | undefined;
  return user ? toSafeUser(user) : null;
}

function toSafeUser(u: UserRecord): SafeUser {
  const { password_hash: _omit, ...rest } = u;
  return rest;
}

// ========================== 用户管理（管理员专属） ==========================

export function listUsers(): SafeUser[] {
  const db = getAuthDb();
  return db.prepare('SELECT * FROM admin_user ORDER BY id DESC').all().map(u => toSafeUser(u as UserRecord));
}

export function createUser(
  username: string,
  password: string,
  role: UserRole = 'user',
  nickname?: string
): { id: number } | { error: string } {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM admin_user WHERE username = ?').get(username);
  if (existing) return { error: 'USERNAME_EXISTS' };
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      'INSERT INTO admin_user (username, password_hash, role, nickname, status) VALUES (?, ?, ?, ?, "active")'
    )
    .run(username, hash, role, nickname ?? null);
  return { id: Number(result.lastInsertRowid) };
}

export function updateUser(
  uid: number,
  fields: { nickname?: string; role?: UserRole; status?: UserStatus }
): boolean {
  const db = getAuthDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.nickname !== undefined) { sets.push('nickname = ?'); vals.push(fields.nickname); }
  if (fields.role !== undefined) { sets.push('role = ?'); vals.push(fields.role); }
  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
  if (sets.length === 0) return false;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(uid);
  const result = db.prepare(`UPDATE admin_user SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return result.changes > 0;
}

export function resetUserPassword(uid: number, newPassword: string): boolean {
  const db = getAuthDb();
  const hash = bcrypt.hashSync(newPassword, 10);
  const result = db
    .prepare('UPDATE admin_user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hash, uid);
  return result.changes > 0;
}
