/**
 * @file 认证相关前端 API
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { API_BASE_URL } from '../constants/apiConstants';

const PREFIX = '/api/v1/auth';

export interface LoginResult {
  token: string;
  user: { id: number; username: string; role: 'admin' | 'user'; nickname: string | null };
}

/** 登录 */
export async function loginApi(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 注册 */
export async function registerApi(input: {
  username: string;
  password: string;
  role?: 'admin' | 'user';
  nickname?: string;
}): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 获取当前用户信息（需要登录） */
export async function getMeApi(token: string): Promise<{ uid: number; username: string; role: 'admin' | 'user' }> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}
