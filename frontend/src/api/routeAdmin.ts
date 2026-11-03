/**
 * @file 路线管理接口封装（成员D）
 * @date 2026-11-03
 */
import { apiFetch } from '../common/apiClient';

export interface RouteAdminItem {
  id: number; name: string; theme: string; description?: string | null;
  estimated_minutes: number; status: number; poi_count: number;
}
const PREFIX = '';

export function fetchRoutesAdmin(all = false): Promise<RouteAdminItem[]> {
  return apiFetch<RouteAdminItem[]>(`/api/v1/routes${all ? '?all=1' : ''}`, { apiPrefix: PREFIX });
}
export function createRoute(data: Partial<RouteAdminItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>('/api/v1/routes', { apiPrefix: PREFIX, method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
}
export function updateRoute(id: number, data: Partial<RouteAdminItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/api/v1/routes/${id}`, { apiPrefix: PREFIX, method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
}
export function deleteRoute(id: number): Promise<void> {
  return apiFetch<void>(`/api/v1/routes/${id}`, { apiPrefix: PREFIX, method: 'DELETE' });
}
export interface StepInput { poi_id: number; stay_minutes?: number; }
export function replaceRouteSteps(id: number, steps: StepInput[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/api/v1/routes/${id}/steps`, { apiPrefix: PREFIX, method: 'PUT', body: JSON.stringify({ steps }), headers: { 'Content-Type': 'application/json' } });
}
