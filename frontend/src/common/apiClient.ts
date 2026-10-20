/**
 * @file 公共层：API 请求封装
 * @description 封装 fetch，自动拼 baseURL、统一错误处理、支持 AbortController。
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
}

/**
 * 统一 API 请求：自动拼 URL、解析 envelope、处理业务错误码
 * @param path 相对路径，如 '/asr'、'/stats'
 * @param options 请求选项
 * @returns 解包后的 envelope.data
 * @throws {Error} HTTP 非 2xx 或业务码非 0 时抛出，message 来自后端 response.message
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const prefix = options.apiPrefix ?? INTERACTION_API_PREFIX;
  const fullUrl = `${baseUrl}${prefix}${path}`;
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (payload.code !== 0) {
    throw new Error(payload.message === '' ? `业务错误（code=${payload.code}）` : payload.message);
  }
  return payload.data;
}
