/**
 * @file 认证接口封装
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const AUTH_BASE = `${API_BASE_URL}/api/v1/auth`;

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

export interface LoginUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  nickname: string | null;
}

export interface LoginResult {
  user: LoginUser;
  token: string;
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

/** 图形验证码 */
export interface CaptchaResult {
  captchaId: string;
  svg: string;
  expiresIn: number;
}

/** 获取图形验证码 */
export async function getCaptchaApi(): Promise<CaptchaResult> {
  const res = await fetch(`${AUTH_BASE}/captcha`);
  const payload = (await res.json()) as ApiResult<CaptchaResult>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload.data;
}

/** 登录 */
export async function loginApi(
  username: string,
  password: string,
  captchaId: string,
  captchaCode: string
): Promise<LoginResult> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captchaId, captchaCode })
  });
  const payload = (await res.json()) as ApiResult<LoginResult>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  // 持久化 token 和 user
  localStorage.setItem('token', payload.data.token);
  localStorage.setItem('user', JSON.stringify(payload.data.user));
  return payload.data;
}

/** 注册（开放注册强制 user 角色） */
export async function registerApi(
  username: string,
  password: string,
  nickname: string | undefined,
  captchaId: string,
  captchaCode: string
): Promise<{ id: number }> {
  const res = await fetch(`${AUTH_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, nickname, role: 'user', captchaId, captchaCode })
  });
  const payload = (await res.json()) as ApiResult<{ id: number }>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload.data;
}

/** 获取当前登录用户信息 */
export async function getMeApi(): Promise<LoginUser> {
  const token = getToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(`${AUTH_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = (await res.json()) as ApiResult<LoginUser>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload.data;
}

/** 登出（前端清本地存储） */
export function logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/** 从 localStorage 取已缓存的用户 */
export function getCachedUser(): LoginUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginUser;
  } catch {
    return null;
  }
}

export function getCachedToken(): string | null {
  return localStorage.getItem('token');
}
