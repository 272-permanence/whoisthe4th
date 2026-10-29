/**
 * @file axios 统一封装（成员D · 全组前端地基）
 * @description 统一 baseURL、请求/响应拦截器、错误处理
 *              - 请求拦截器：自动注入 JWT（等待成员C规范后对齐 header 名）
 *              - 响应拦截器：统一解包 envelope，401 自动清 token
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { API_BASE_URL } from '../constants/apiConstants';
import { useUserStore } from '../stores/user';

/** 后端统一响应体结构（与后端 common 层保持一致） */
export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 业务错误码 */
export const BUSINESS_CODES = {
  SUCCESS: 0,
  INVALID_PARAM: 40001,
  NOT_FOUND: 40401,
  INTERNAL_ERROR: 50000,
} as const;

export interface ApiError extends Error {
  code?: number;
  status?: number;
}

/**
 * 统一 axios 实例
 */
const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 请求拦截器：注入 token
 * TODO: 等成员C确定 JWT header 名后，确认是 Authorization 还是其他
 */
http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const userStore = useUserStore();
    const token = userStore.token;
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 响应拦截器：解包 envelope + 统一错误处理
 */
http.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope>) => {
    const payload = response.data;
    // 成功
    if (payload && payload.code === BUSINESS_CODES.SUCCESS) {
      return payload.data as unknown as AxiosResponse<unknown>;
    }
    // 业务错误：构造统一错误对象
    const err: ApiError = new Error(payload?.message || '业务异常');
    err.code = payload?.code;
    throw err;
  },
  (error) => {
    const status = error?.response?.status;
    const payload = error?.response?.data;
    const err: ApiError = new Error(payload?.message || error?.message || '网络异常');
    err.code = payload?.code;
    err.status = status;

    // 401 → 清 token（等成员C登录页出来后跳过去）
    if (status === 401) {
      const userStore = useUserStore();
      userStore.clearToken();
      err.message = '登录已过期，请重新登录';
    }

    return Promise.reject(err);
  }
);

/**
 * 便捷 GET / POST
 */
export async function httpGet<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
  return http.get(url, { params }) as unknown as Promise<T>;
}

export async function httpPost<T = unknown>(url: string, data?: unknown): Promise<T> {
  return http.post(url, data) as unknown as Promise<T>;
}

export async function httpPut<T = unknown>(url: string, data?: unknown): Promise<T> {
  return http.put(url, data) as unknown as Promise<T>;
}

export async function httpPatch<T = unknown>(url: string, data?: unknown): Promise<T> {
  return http.patch(url, data) as unknown as Promise<T>;
}

export async function httpDelete<T = unknown>(url: string): Promise<T> {
  return http.delete(url) as unknown as Promise<T>;
}

export { http };
