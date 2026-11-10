/**
 * @file 公共层：API 请求封装
 * @description 封装 fetch，自动拼 baseURL、统一错误处理、支持 AbortController、
 *              自动注入/提取 X-Trace-Id 请求头，实现全链路 traceId 传递。
 *              所有后端 HTTP 请求（REST 类型）应从这里出发，避免散落的裸 fetch。
 *              EventSource 不在此封装（它只能 GET，且 URL 拼装逻辑不同）。
 * @author 第八组（成员A）
 * @date 2026-10-20
 */
import { API_BASE_URL, INTERACTION_API_PREFIX } from '../constants/apiConstants';

/** traceId 在 localStorage 中的键名 */
const TRACE_ID_KEY = 'traceId';

/**
 * 生成一个 traceId：时间戳 + 8位随机串
 */
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 获取当前 traceId：localStorage 中没有则生成一个并写入
 * 供埋点工具等外部模块调用
 */
export function getTraceId(): string {
  let traceId = localStorage.getItem(TRACE_ID_KEY);
  if (!traceId) {
    traceId = generateTraceId();
    localStorage.setItem(TRACE_ID_KEY, traceId);
  }
  return traceId;
}

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
  // 请求时：自动注入 traceId 到 X-Trace-Id 请求头
  const mergedHeaders: Record<string, string> = {
    Accept: 'application/json',
    'X-Trace-Id': getTraceId(),
    ...(options.headers as Record<string, string> ?? {})
  };
  const response = await fetch(fullUrl, {
    ...options,
    headers: mergedHeaders,
  });
  // 响应时：从后端 X-Trace-Id 响应头提取 traceId 并存入 localStorage（实现全链路传递）
  const respTraceId = response.headers.get('X-Trace-Id');
  if (respTraceId) {
    localStorage.setItem(TRACE_ID_KEY, respTraceId);
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
