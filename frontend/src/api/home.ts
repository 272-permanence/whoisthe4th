/**
 * @file 首页聚合接口（成员D）
 * @date 2026-11-03
 */
import { apiFetch } from '../common/apiClient';

export interface HomeBanner { id: number; title: string; image?: string; color?: string; }
export interface HomeQuickEntry { icon: string; label: string; path: string; color: string; }
export interface HomePoi { id: number; name: string; category: string; description?: string | null; }
export interface HomeRoute { id: number; name: string; theme: string; description?: string | null; estimated_minutes: number; }
export interface HomeStats { totalInteractions: number; todayInteractions: number; positiveRate: number; }
export interface HomeProduct { id: number; name: string; price: number; image?: string; }

export interface HomeResponse {
  banners: HomeBanner[];
  quickEntries: HomeQuickEntry[];
  hotPois: HomePoi[];
  recommendedRoutes: HomeRoute[];
  stats: HomeStats;
  hotProducts: HomeProduct[];
}

const ROOT_PREFIX = ''; // 不走 asr-tts 前缀

export function fetchHome(): Promise<HomeResponse> {
  return apiFetch<HomeResponse>('/api/v1/home', { apiPrefix: ROOT_PREFIX });
}
