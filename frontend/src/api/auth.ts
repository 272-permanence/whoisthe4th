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
  status?: 'active' | 'disabled';
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
  persistLogin(payload.data);
  return payload.data;
}

/** 登录成功后统一落本地存储（所有登录通道共用） */
function persistLogin(data: LoginResult): void {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
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

/** 修改个人信息（昵称） */
export async function updateMeApi(nickname: string): Promise<LoginUser> {
  const token = getToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(`${AUTH_BASE}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nickname })
  });
  const payload = (await res.json()) as ApiResult<LoginUser>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  // 同步更新本地缓存
  localStorage.setItem('user', JSON.stringify(payload.data));
  return payload.data;
}

/** 修改密码（需校验旧密码） */
export async function changePasswordApi(oldPassword: string, newPassword: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录');
  const res = await fetch(`${AUTH_BASE}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ oldPassword, newPassword })
  });
  const payload = (await res.json()) as ApiResult<null>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
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

// ========================== 统一身份认证 ==========================

/** 各登录通道当前模式（mock / real），用于页面上「演示模式」提示 */
export interface ProviderStatus {
  password: { enabled: boolean; mode: string };
  email: { enabled: boolean; mode: string; exposeCode: boolean };
  phone: { enabled: boolean; mode: string; exposeCode: boolean };
  wechat: { enabled: boolean; mode: string };
  sso: { enabled: boolean; mode: string; url: string; clientId: string };
  cert: { enabled: boolean; mode: string };
}

/** 发送邮箱验证码的返回 */
export interface EmailCodeResult {
  expiresIn: number;
  cooldownSec: number;
  mock: boolean;
  devCode?: string;
}

/** 微信扫码会话 */
export interface WechatQrResult {
  sceneId: string;
  qrText: string;
  expiresIn: number;
  mock: boolean;
}

export type WechatQrStatus = 'pending' | 'scanned' | 'confirmed' | 'expired';

/** 扫码轮询结果：confirmed 时会带上登录态 */
export interface WechatQrPollResult {
  status: WechatQrStatus;
  expiresIn: number;
  user?: LoginUser;
  token?: string;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  const payload = (await res.json()) as ApiResult<T>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload.data;
}

/** 查询各登录通道状态（失败时回退为全部 mock，不阻塞页面） */
export async function getProvidersApi(): Promise<ProviderStatus | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/providers`);
    const payload = (await res.json()) as ApiResult<ProviderStatus>;
    if (!res.ok || payload.code !== 0) return null;
    return payload.data;
  } catch {
    return null;
  }
}

/** 发送邮箱验证码（mock 模式下 devCode 直接返回给页面展示） */
export function sendEmailCodeApi(email: string): Promise<EmailCodeResult> {
  return postJson<EmailCodeResult>('/email/code', { email });
}

/** 邮箱验证码登录（首次登录自动注册为普通用户） */
export async function emailLoginApi(email: string, code: string): Promise<LoginResult> {
  const data = await postJson<LoginResult>('/email/login', { email, code });
  persistLogin(data);
  return data;
}

/** 发送手机号验证码 */
export async function sendPhoneCodeApi(phone: string): Promise<EmailCodeResult> {
  return postJson<EmailCodeResult>('/phone/code', { phone });
}

/** 手机号验证码登录（首次登录自动注册为普通用户） */
export async function phoneLoginApi(phone: string, code: string): Promise<LoginResult> {
  const data = await postJson<LoginResult>('/phone/login', { phone, code });
  persistLogin(data);
  return data;
}

/** 创建微信扫码会话 */
export function createWechatQrApi(): Promise<WechatQrResult> {
  return postJson<WechatQrResult>('/wechat/qr');
}

/** 轮询扫码状态，确认后写入登录态 */
export async function pollWechatQrApi(sceneId: string): Promise<WechatQrPollResult> {
  const res = await fetch(`${AUTH_BASE}/wechat/qr/${encodeURIComponent(sceneId)}`);
  const payload = (await res.json()) as ApiResult<WechatQrPollResult>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  const data = payload.data;
  if (data.status === 'confirmed' && data.token && data.user) {
    persistLogin({ token: data.token, user: data.user });
  }
  return data;
}

/** 模拟手机扫码 */
export function mockWechatScanApi(sceneId: string): Promise<{ status: string }> {
  return postJson<{ status: string }>(`/wechat/qr/${encodeURIComponent(sceneId)}/mock-scan`);
}

/** 模拟手机确认登录 */
export function mockWechatConfirmApi(sceneId: string): Promise<{ status: string }> {
  return postJson<{ status: string }>(`/wechat/qr/${encodeURIComponent(sceneId)}/mock-confirm`);
}

/** 模拟统一认证回调，直接换取登录态 */
export async function ssoMockLoginApi(ticket?: string): Promise<LoginResult> {
  const data = await postJson<LoginResult>('/sso/mock-login', { ticket });
  persistLogin(data);
  return data;
}

/** 上传证书文件登录 */
export async function certLoginApi(file: File): Promise<LoginResult> {
  const form = new FormData();
  form.append('cert', file);
  const res = await fetch(`${AUTH_BASE}/cert/login`, { method: 'POST', body: form });
  const payload = (await res.json()) as ApiResult<LoginResult>;
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  persistLogin(payload.data);
  return payload.data;
}
