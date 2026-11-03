/**
 * @file POI 管理接口封装（成员D）
 * @date 2026-11-03
 */
import { apiFetch } from '../common/apiClient';

export interface PoiItem {
  id: number; name: string; category: string; description?: string | null;
  location?: string | null; status: number;
}
const PREFIX = '';

export function fetchPois(all = false): Promise<PoiItem[]> {
  return apiFetch<PoiItem[]>(`/api/v1/poi${all ? '?all=1' : ''}`, { apiPrefix: PREFIX });
}
export function createPoi(data: Partial<PoiItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>('/api/v1/poi', { apiPrefix: PREFIX, method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
}
export function updatePoi(id: number, data: Partial<PoiItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/api/v1/poi/${id}`, { apiPrefix: PREFIX, method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
}
export function deletePoi(id: number): Promise<void> {
  return apiFetch<void>(`/api/v1/poi/${id}`, { apiPrefix: PREFIX, method: 'DELETE' });
}
