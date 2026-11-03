/**
 * @file 成员C 认证服务：JWT 签发/校验 + 密码哈希
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import jwt, { type Secret } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';
import { findUserByUsername, createUser, findUserById, type UserRole } from './authDb.js';

const logger = createLogger('auth-service');

/** JWT 载荷（Payload） */
export interface JwtPayload {
  uid: number;
  username: string;
  role: UserRole;
}

/** 登录成功返回给前端的结构 */
export interface LoginResult {
  token: string;
  user: { id: number; username: string; role: UserRole; nickname: string | null };
}

/** 同步哈希密码（注册时用） */
export function hashPasswordSync(password: string, saltRounds = 10): string {
  return bcrypt.hashSync(password, saltRounds);
}

/** 验证密码是否匹配 */
export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/** 签发 JWT */
export function signToken(payload: JwtPayload): string {
  const secret: Secret = String(config.jwt.secret);
  const opts = {
    expiresIn: config.jwt.expiresIn as string,
    algorithm: 'HS256' as const
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(payload, secret, opts);
}

/** 校验 JWT，失败返回 null（不抛异常，让中间件统一处理） */
export function verifyToken(token: string): JwtPayload | null {
  const secret: Secret = String(config.jwt.secret);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded = (jwt.verify as any)(token, secret, { algorithms: ['HS256'] });
    return decoded as JwtPayload;
  } catch (err) {
    logger.WARN(`JWT 校验失败: ${(err as Error).message}`);
    return null;
  }
}

/** 业务逻辑：注册 */
export function register(input: {
  username: string;
  password: string;
  role?: UserRole;
  nickname?: string;
}): LoginResult {
  const existing = findUserByUsername(input.username);
  if (existing) {
    throw new Error('USERNAME_EXISTS');
  }
  const passwordHash = hashPasswordSync(input.password);
  const id = createUser({
    username: input.username,
    passwordHash,
    role: input.role ?? 'user',
    nickname: input.nickname
  });
  const user = findUserById(id)!;
  logger.INFO(`新用户注册: ${input.username} (role=${user.role})`);
  return buildLoginResult(user);
}

/** 业务逻辑：登录 */
export function login(username: string, password: string): LoginResult {
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('BAD_CREDENTIALS');
  }
  logger.INFO(`用户登录: ${username}`);
  return buildLoginResult(user);
}

function buildLoginResult(user: {
  id: number;
  username: string;
  role: UserRole;
  nickname: string | null;
}): LoginResult {
  const payload: JwtPayload = {
    uid: user.id,
    username: user.username,
    role: user.role
  };
  return {
    token: signToken(payload),
    user: { id: user.id, username: user.username, role: user.role, nickname: user.nickname }
  };
}
