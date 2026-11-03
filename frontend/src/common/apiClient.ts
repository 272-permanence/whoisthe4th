/**
 * @file 公共层：API 请求封装
 * @description 封装 fetch，自动拼 baseURL、统一错误处理、支持 AbortController。
 *              自动注入 JWT Authorization header（从 localStorage 读取 token）。
 *              收到 401 时自动清 token 并跳转 /login。
 *              所有后端 HTTP 请求（REST 类型）应从这里出发，避免散落的裸 fetch。
 *              EventSource 不在此封装（它只能 GET，且 URL 拼装逻辑不同）。
 * @author 第八组（成员A）
 * @date 2026-10-20
 */
import { API_BASE_URL, INTERACTION_API_PREFIX } from '../constants/apiConstants';

/** 后端统一响应体结构（全组必须遵守） */
export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 请求选项（比原生 fetch 多了 baseUrl / apiPrefix 可选覆盖） */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** 请求体，fetch 原生 body 支持的类型 */
  body?: BodyInit;
  /** 自定义 baseUrl，不填则用 VITE_API_BASE_URL */
  baseUrl?: string;
  /** API 前缀，不填则用 INTERACTION_API_PREFIX */
  apiPrefix?: string;
  /** 跳过自动注入 Authorization header（公开接口用） */
  skipAuth?: boolean;
}

/** 从 localStorage 读取 token（与 api/auth.ts 持久化约定一致） */
function getToken(): string | null {
  return localStorage.getItem('token');
}

/** 清 token 并跳转登录页（401 兜底） */
function forceLogout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
}

/**
 * 统一 API 请求：自动拼 URL、注入 JWT、解析 envelope、处理 401 自动登出
 * @param path 相对路径，如 '/asr'、'/stats'
 * @param options 请求选项
 * @returns 解包后的 envelope.data
 * @throws {Error} HTTP 非 2xx（401 除外自动跳转）或业务码非 0 时抛出
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const prefix = options.apiPrefix ?? INTERACTION_API_PREFIX;
  const fullUrl = `${baseUrl}${prefix}${path}`;

  // 合并 headers：skipAuth 为 true 时不自动加 token
  const autoHeaders: Record<string, string> = { Accept: 'application/json' };
  if (!options.skipAuth) {
    const token = getToken();
    if (token) autoHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...autoHeaders,
      ...(options.headers ?? {})
    }
  });

  // 401 兜底：清 token 跳 /login
  if (response.status === 401) {
    forceLogout();
    throw new Error('登录已过期，请重新登录');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (payload.code !== 0) {
    throw new Error(payload.message === '' ? `业务错误（code=${payload.code}）` : payload.message);
  }
  return payload.data;
}
