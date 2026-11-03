/**
 * @file 商品管理接口封装
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { getCachedToken } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const PRODUCT_BASE = `${API_BASE_URL}/api/v1/products`;

export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

function authHeaders(): Record<string, string> {
  const token = getCachedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 列表（公开） */
export async function listProductsApi(): Promise<Product[]> {
  const res = await fetch(PRODUCT_BASE);
  const payload = (await res.json()) as ApiResult<Product[]>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 详情（公开） */
export async function getProductApi(id: number): Promise<Product> {
  const res = await fetch(`${PRODUCT_BASE}/${id}`);
  const payload = (await res.json()) as ApiResult<Product>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 新建（需 admin） */
export async function createProductApi(body: Partial<Product>): Promise<Product> {
  const res = await fetch(PRODUCT_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<Product>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 更新（需 admin） */
export async function updateProductApi(id: number, body: Partial<Product>): Promise<Product> {
  const res = await fetch(`${PRODUCT_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  const payload = (await res.json()) as ApiResult<Product>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 删除（需 admin） */
export async function deleteProductApi(id: number): Promise<void> {
  const res = await fetch(`${PRODUCT_BASE}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const payload = (await res.json()) as ApiResult<null>;
  if (!res.ok || payload.code !== 0) throw new Error(payload.message);
}
