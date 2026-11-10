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

/** 统一身份认证提供方 */
export type ExternalProvider = 'email' | 'phone' | 'wechat' | 'sso' | 'cert';

/** 提供方 → admin_user 身份标识列 */
const EXTERNAL_COLUMN: Record<ExternalProvider, string> = {
  email: 'email',
  phone: 'phone',
  wechat: 'wechat_openid',
  sso: 'sso_uid',
  cert: 'cert_fingerprint'
};

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
  email: string | null;
  phone: string | null;
  wechat_openid: string | null;
  sso_uid: string | null;
  cert_fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

/** 对外安全的用户信息（不含密码哈希与外部身份标识） */
export type SafeUser = Omit<UserRecord, 'password_hash' | 'phone' | 'wechat_openid' | 'sso_uid' | 'cert_fingerprint'>;

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
      `INSERT INTO admin_user (username, password_hash, role, nickname, status) VALUES (?, ?, ?, ?, 'active')`
    )
    .run(username, hash, 'user', nickname ?? null);
  return { id: Number(result.lastInsertRowid) };
}

export function getUserById(uid: number): SafeUser | null {
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM admin_user WHERE id = ?').get(uid) as UserRecord | undefined;
  return user ? toSafeUser(user) : null;
}

/**
 * 按用户名查询用户（仅用于登录审计时区分失败原因，不对外暴露）
 * @param username 用户名
 */
export function findUserByUsername(username: string): Pick<SafeUser, 'id' | 'username' | 'status'> | null {
  const db = getAuthDb();
  const user = db.prepare('SELECT id, username, status FROM admin_user WHERE username = ?').get(username) as
    | Pick<UserRecord, 'id' | 'username' | 'status'>
    | undefined;
  return user ?? null;
}

function toSafeUser(u: UserRecord): SafeUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    nickname: u.nickname,
    status: u.status,
    email: u.email ?? null,
    created_at: u.created_at,
    updated_at: u.updated_at
  };
}

/**
 * 第三方 / 统一认证登录：按身份标识查用户，首次登录自动建号（无密码）
 * @param provider 认证提供方
 * @param identifier 该提供方下的唯一标识（邮箱 / openid / SSO uid / 证书指纹）
 * @param nickname 首次建号时使用的昵称
 */
export function loginByExternal(
  provider: ExternalProvider,
  identifier: string,
  nickname?: string
): { user: SafeUser; token: string } | { error: string } {
  const db = getAuthDb();
  const column = EXTERNAL_COLUMN[provider];
  let user = db.prepare(`SELECT * FROM admin_user WHERE ${column} = ?`).get(identifier) as UserRecord | undefined;

  if (!user) {
    const username = buildExternalUsername(provider, identifier);
    // 外部登录账号不设置密码，password_hash 存空串，账号密码通道永远无法登录
    const result = db
      .prepare(
        `INSERT INTO admin_user (username, password_hash, role, nickname, status, ${column})
         VALUES (?, '', 'user', ?, 'active', ?)`
      )
      .run(username, nickname ?? null, identifier);
    user = db.prepare('SELECT * FROM admin_user WHERE id = ?').get(Number(result.lastInsertRowid)) as UserRecord;
  }

  if (user.status === 'disabled') return { error: 'USER_DISABLED' };

  const token = signToken({ uid: user.id, username: user.username, role: user.role });
  return { user: toSafeUser(user), token };
}

/**
 * 生成外部账号用户名：前缀 + 标识片段，重名时追加序号
 * @param provider 认证提供方
 * @param identifier 外部身份标识
 */
function buildExternalUsername(provider: ExternalProvider, identifier: string): string {
  const db = getAuthDb();
  const prefix = { email: 'mail', phone: 'phone', wechat: 'wx', sso: 'sso', cert: 'cert' }[provider];
  const raw = identifier.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || Date.now().toString(36);
  let name = `${prefix}_${raw}`;
  let index = 2;
  while (db.prepare('SELECT id FROM admin_user WHERE username = ?').get(name)) {
    name = `${prefix}_${raw}_${index++}`;
  }
  return name;
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
      `INSERT INTO admin_user (username, password_hash, role, nickname, status) VALUES (?, ?, ?, ?, 'active')`
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
