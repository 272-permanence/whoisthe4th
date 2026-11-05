/**
 * @file CMS 内容接口封装
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { getCachedToken } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

export type ContentType = 'carousel' | 'scenic' | 'route' | 'announcement' | 'about';

export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  subtitle: string | null;
  content: string | null;
  image_url: string | null;
  extra_json: string | null;
  sort_order: number;
  published: number;
  created_at: string;
  updated_at: string;
  extra?: Record<string, unknown>;
}

function authHeaders(needAuth = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (needAuth) {
    const token = getCachedToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
  }
  return h;
}

// 公开接口（用户端动态渲染用）
export async function listPublishedContent(type: ContentType): Promise<ContentItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/content/${type}`);
  const payload = (await res.json()) as ApiResult<ContentItem[]>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

// 管理端接口（admin 专属）
export async function listAllContent(type?: ContentType): Promise<ContentItem[]> {
  const qs = type ? `?type=${type}` : '';
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/content${qs}`, { headers: authHeaders() });
  const payload = (await res.json()) as ApiResult<ContentItem[]>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

export async function createContent(body: Partial<ContentItem> & { type: ContentType; title: string }): Promise<ContentItem> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<ContentItem>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

export async function updateContent(id: number, body: Partial<ContentItem>): Promise<ContentItem> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/content/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<ContentItem>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

export async function deleteContent(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/content/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const payload = (await res.json()) as ApiResult<null>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
}

export async function togglePublishContent(id: number): Promise<{ id: number; published: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/content/${id}/publish`, {
    method: 'POST',
    headers: authHeaders()
  });
  const payload = (await res.json()) as ApiResult<{ id: number; published: boolean }>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

// ==================== 图片上传（admin 专属） ====================

export interface UploadImageResult {
  url: string;
  filename: string;
  size: number;
}

/** 上传图片到后端，返回可直接访问的 URL（相对路径，如 /uploads/xxx.jpg） */
export async function uploadImage(file: File): Promise<UploadImageResult> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/upload`, {
    method: 'POST',
    headers: authHeaders(), // 注意：不要手动设 Content-Type，浏览器会自动带 boundary
    body: formData
  });
  const payload = (await res.json()) as ApiResult<UploadImageResult>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 把后端返回的相对 URL 拼成完整可访问地址 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ==================== 用户管理（admin 专属） ====================

export interface AdminUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  nickname: string | null;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/users`, { headers: authHeaders() });
  const payload = (await res.json()) as ApiResult<AdminUser[]>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

export async function createAdminUser(body: { username: string; password: string; role?: 'admin' | 'user'; nickname?: string }): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<{ id: number }>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

export async function updateAdminUser(id: number, body: { nickname?: string; role?: 'admin' | 'user'; status?: 'active' | 'disabled' }): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<null>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
}

export async function resetAdminUserPassword(id: number, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ password })
  });
  const payload = (await res.json()) as ApiResult<null>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
}
