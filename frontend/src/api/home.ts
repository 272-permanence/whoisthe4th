/**
 * @file 首页聚合接口 + 商品相关（成员D）
 * @date 2026-11-25（扩展：商品列表 / 详情 / 点赞 / 收藏，走 /api/v1/home/products MySQL 版）
 */
import { apiFetch } from '../common/apiClient';

export interface HomeBanner { id: number; title: string; image?: string; color?: string; }
export interface HomeQuickEntry { icon: string; label: string; path: string; color: string; }
export interface HomePoi { id: number; name: string; category: string; description?: string | null; }
export interface HomeRoute { id: number; name: string; theme: string; description?: string | null; estimated_minutes: number; }
export interface HomeStats {
  totalInteractions: number;
  todayInteractions: number;
  positiveRate: number;
  totalProducts?: number;
}
export interface HomeProduct {
  id: number;
  name: string;
  price: number;
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  like_count?: number;
  favorite_count?: number;
  sales?: number;
  stock?: number;
}

export interface HomeResponse {
  banners: HomeBanner[];
  quickEntries: HomeQuickEntry[];
  hotPois: HomePoi[];
  recommendedRoutes: HomeRoute[];
  stats: HomeStats;
  hotProducts: HomeProduct[];
}

const PREFIX = '/api/v1/home';

/** 首页聚合 */
export function fetchHome(): Promise<HomeResponse> {
  return apiFetch<HomeResponse>(PREFIX);
}

/** 商品列表（公开，可选 category 过滤） */
export function fetchHomeProducts(category?: string): Promise<HomeProduct[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<HomeProduct[]>(`${PREFIX}/products${qs}`);
}

/** 商品详情 */
export function fetchHomeProductDetail(id: number): Promise<HomeProduct> {
  return apiFetch<HomeProduct>(`${PREFIX}/products/${id}`);
}

/** 商品点赞（toggle，持久化） */
export async function toggleProductLike(id: number, userId = 'anonymous'): Promise<{ liked: boolean; likeCount: number }> {
  return apiFetch<{ liked: boolean; likeCount: number }>(`${PREFIX}/products/${id}/like`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

/** 商品收藏（toggle，持久化） */
export async function toggleProductFavorite(id: number, userId = 'anonymous'): Promise<{ favorited: boolean; favoriteCount: number }> {
  return apiFetch<{ favorited: boolean; favoriteCount: number }>(`${PREFIX}/products/${id}/favorite`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}
