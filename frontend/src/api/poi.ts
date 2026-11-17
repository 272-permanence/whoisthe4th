/**
 * @file POI 查询 / 后台管理 / 导航接口封装
 * @author 第八组（成员B 查询与导航 + 成员D 后台 CRUD）
 * @date 2026-11-17
 */
import { apiFetch } from '../common/apiClient';

export interface PoiItem {
  id: number; name: string; category: string; description?: string | null;
  location?: string | null; status: number;
}

/** 景点分类，与后端 poi.category 枚举一致 */
export type PoiCategory = 'attraction' | 'facility' | 'landmark' | 'food' | 'other';

/** 用户端景点结构（含经纬度，供地图打点与导航） */
export interface Poi {
  id: number;
  name: string;
  category: PoiCategory;
  description: string | null;
  location: string | null;
  longitude: number | null;
  latitude: number | null;
}

/** 景点列表查询参数 */
export interface PoiQuery {
  category?: string;
  keyword?: string;
  limit?: number;
}

/** 出行方式，对应后端高德 direction 接口 */
export type TravelMode = 'walking' | 'driving';

/** 导航路径点（高德 GCJ-02 坐标） */
export interface NavigationPoint {
  lng: number;
  lat: number;
}

/** 导航步骤 */
export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
}

/** 路径规划结果 */
export interface NavigationResult {
  mode: TravelMode;
  origin: NavigationPoint;
  destination: NavigationPoint;
  /** 总距离，单位米 */
  distance: number;
  /** 预计耗时，单位秒 */
  duration: number;
  polyline: NavigationPoint[];
  steps: NavigationStep[];
}

const PREFIX = '';

/**
 * 查询启用中的景点列表（景色推荐页 / 导航页用）
 * @param params 分类、关键词、条数上限
 * @returns 景点数组
 */
export function listPois(params: PoiQuery = {}): Promise<Poi[]> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch<Poi[]>(`/api/v1/poi/list${qs ? `?${qs}` : ''}`, { apiPrefix: PREFIX });
}

/**
 * 请求后端代理的高德路径规划
 * @param origin 起点坐标
 * @param destination 终点坐标
 * @param mode 步行 / 驾车
 * @returns 路径规划结果
 */
export function planNavigation(
  origin: NavigationPoint,
  destination: NavigationPoint,
  mode: TravelMode
): Promise<NavigationResult> {
  const query = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    mode
  });
  return apiFetch<NavigationResult>(`/api/v1/navigation/route?${query.toString()}`, { apiPrefix: PREFIX });
}

export function fetchPois(all = false): Promise<PoiItem[]> {
  return apiFetch<PoiItem[]>(`/api/v1/poi${all ? '?all=1' : ''}`, { apiPrefix: PREFIX });
}

export function createPoi(data: Partial<PoiItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>('/api/v1/poi', {
    apiPrefix: PREFIX, method: 'POST',
    body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' }
  });
}

export function updatePoi(id: number, data: Partial<PoiItem>): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/api/v1/poi/${id}`, {
    apiPrefix: PREFIX, method: 'PUT',
    body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' }
  });
}

export function deletePoi(id: number): Promise<void> {
  return apiFetch<void>(`/api/v1/poi/${id}`, { apiPrefix: PREFIX, method: 'DELETE' });
}
