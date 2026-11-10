/**
 * @file API 层统一导出入口（成员D）
 * @description 所有业务 API 统一从此文件 export，避免散落的 fetch/axios 调用
 *              成员A/B/C 已有自己的 api/* 文件，这里聚合 + 新增失物招领模块
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { httpGet, httpPost, httpPut, httpPatch, httpDelete } from '../common/request';

// re-export 已有的模块（保持兼容）
export * from './analytics';
export * from './asrTts';
export * from './kb';

// ======================== 失物招领 ========================

export interface LostFoundItem {
  id: number;
  type: 'lost' | 'found';
  category: string;
  title: string;
  description?: string;
  location?: string;
  image_url?: string;
  contact?: string;
  publisher_name?: string;
  user_id?: string;
  status: 'open' | 'resolved' | 'expired';
  created_at: string;
  updated_at?: string;
}

export interface LostFoundListParams {
  type?: 'lost' | 'found';
  category?: string;
  status?: 'open' | 'resolved' | 'expired';
  keyword?: string;
  page?: number;
  size?: number;
}

export interface LostFoundListResult {
  list: LostFoundItem[];
  pagination: { page: number; size: number; total: number; totalPages: number };
}

export interface LostFoundCreateInput {
  type: 'lost' | 'found';
  category?: string;
  title: string;
  description?: string;
  location?: string;
  image_url?: string;
  contact?: string;
  publisher_name?: string;
  user_id?: string;
}

const LF_PREFIX = '/api/v1/lost-found';

/** 创建失物招领 */
export function createLostFound(data: LostFoundCreateInput) {
  return httpPost<LostFoundItem>(LF_PREFIX, data);
}

/** 查询列表（多条件筛选） */
export function getLostFoundList(params?: LostFoundListParams) {
  return httpGet<LostFoundListResult>(LF_PREFIX, params as Record<string, unknown>);
}

/** 查详情 */
export function getLostFoundById(id: number) {
  return httpGet<LostFoundItem>(`${LF_PREFIX}/${id}`);
}

/** 更新 */
export function updateLostFound(id: number, data: Partial<LostFoundCreateInput>) {
  return httpPut<LostFoundItem>(`${LF_PREFIX}/${id}`, data);
}

/** 改状态 */
export function updateLostFoundStatus(id: number, status: 'open' | 'resolved' | 'expired') {
  return httpPatch<{ id: number; status: string }>(`${LF_PREFIX}/${id}/status`, { status });
}

/** 删除 */
export function deleteLostFound(id: number) {
  return httpDelete<{ id: number }>(`${LF_PREFIX}/${id}`);
}
