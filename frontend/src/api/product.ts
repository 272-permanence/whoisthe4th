/**
 * @file 商品管理前端 API
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { API_BASE_URL } from '../constants/apiConstants';

const PREFIX = '/api/v1/products';

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

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  imageUrl?: string;
}

/** 列表 */
export async function listProductsApi(category?: string): Promise<Product[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`${API_BASE_URL}${PREFIX}${qs}`);
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 详情 */
export async function getProductApi(id: number): Promise<Product> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/${id}`);
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data;
}

/** 创建（admin） */
export async function createProductApi(token: string, input: ProductInput): Promise<number> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
  return payload.data.id;
}

/** 更新（admin） */
export async function updateProductApi(token: string, id: number, input: Partial<ProductInput>): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
}

/** 删除（admin） */
export async function deleteProductApi(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${PREFIX}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message);
}
