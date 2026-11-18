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

/** 统一身份认证 — 外部通道类型 */
export type ExternalProvider = 'email' | 'phone' | 'wechat' | 'sso' | 'cert';

/** 外部通道 -> admin_user 表中对应的列名 */
export const EXTERNAL_COLUMN: Record<ExternalProvider, string> = {
  email: 'email',
  phone: 'phone',
  wechat: 'wechat_openid',
  sso: 'sso_uid',
  cert: 'cert_fingerprint'
};

/** 外部通道生成的默认用户名前缀（保证可读 + 唯一） */
export function buildExternalUsername(provider: ExternalProvider, identifier: string): string {
  const cleaned = identifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20);
  return `${provider}_${cleaned}`;
}

export interface JwtPayload {
  uid: number;
  username: string;
  role: UserRole;
}

/** 外部身份绑定的列也暴露出来（供统一认证路由使用） */
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

/** SafeUser 排除所有敏感字段：password_hash + 外部身份绑定列（避免泄露） */
export type SafeUser = Omit<UserRecord, 'password_hash' | 'wechat_openid' | 'sso_uid' | 'cert_fingerprint'>;

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
      `INSERT INTO admin_user (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)`
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
      `INSERT INTO admin_user (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)`
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

// ========================== 统一认证：外部通道登录 ==========================

/**
 * 外部通道统一登录入口（邮箱验证码 / 手机号验证码 / 微信扫码 / SSO / 证书）
 * - identifier 不存在 → 自动建号，password_hash 存空串（和密码通道物理隔离）
 * - identifier 已存在 → 直接返回 + 签发 JWT
 */
export function loginByExternal(
  provider: ExternalProvider,
  identifier: string,
  nickname?: string
): { user: SafeUser; token: string } | { error: string } {
  const db = getAuthDb();
  const column = EXTERNAL_COLUMN[provider];

  // 已存在该外部身份 → 直接登录
  const existing = db
    .prepare(`SELECT * FROM admin_user WHERE ${column} = ?`)
    .get(identifier) as UserRecord | undefined;

  if (existing) {
    if (existing.status === 'disabled') return { error: 'USER_DISABLED' };
    const safe = toSafeUser(existing);
    const token = signToken({ uid: existing.id, username: existing.username, role: existing.role });
    return { user: safe, token };
  }

  // 新用户 → 自动建号，password_hash 存空串（外部账号无法通过密码登录）
  const username = buildExternalUsername(provider, identifier);
  const userNick = nickname ?? `${provider === 'sso' ? '统一认证' : provider === 'phone' ? '手机' : provider === 'email' ? '邮箱' : '第三方'}用户`;
  const bindCol = column;

  try {
    const result = db
      .prepare(
        `INSERT INTO admin_user (username, password_hash, role, nickname, ${bindCol}) VALUES (?, '', 'user', ?, ?)`
      )
      .run(username, userNick, identifier);

    const uid = Number(result.lastInsertRowid);
    const safe = getUserById(uid)!;
    const token = signToken({ uid, username: safe.username, role: safe.role });
    return { user: safe, token };
  } catch (err) {
    // UNIQUE 冲突 → 并发建号时另一个请求先建了，直接去查
    if (String(err).includes('UNIQUE')) {
      const race = db.prepare(`SELECT * FROM admin_user WHERE ${column} = ?`).get(identifier) as UserRecord | undefined;
      if (race) {
        const safe = toSafeUser(race);
        const token = signToken({ uid: race.id, username: race.username, role: race.role });
        return { user: safe, token };
      }
    }
    return { error: 'CREATE_FAILED' };
  }
}
