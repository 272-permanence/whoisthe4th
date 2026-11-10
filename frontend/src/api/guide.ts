/**
 * @file 游玩攻略接口（成员D）
 * @date 2026-11-03
 */
import { apiFetch } from '../common/apiClient';

export interface RouteSummary {
  id: number; name: string; theme: string; description: string | null;
  estimated_minutes: number; poi_count: number;
}
export interface PoiStep {
  poi_id: number; seq: number; stay_minutes: number;
  name: string; category: string; description: string | null; location: string | null;
}
export interface RouteDetail extends RouteSummary { steps: PoiStep[]; }

const PREFIX = '';

export function fetchRoutes(theme?: string): Promise<RouteSummary[]> {
  const q = theme ? `?theme=${theme}` : '';
  return apiFetch<RouteSummary[]>(`/api/v1/routes${q}`, { apiPrefix: PREFIX });
}
export function fetchRouteDetail(id: number): Promise<RouteDetail> {
  return apiFetch<RouteDetail>(`/api/v1/routes/${id}`, { apiPrefix: PREFIX });
}
