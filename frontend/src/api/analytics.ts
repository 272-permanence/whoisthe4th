/**
 * @file 数据分析接口封装
 * @author 第八组
 * @date 2026-10-15
 * @description 埋点上报、统计查询、SSE 实时推送
 */

import { apiFetch } from '../common/apiClient';
import { API_BASE_URL } from '../constants/apiConstants';

/** 数据洞察模块接口前缀 */
const ANALYTICS_API_PREFIX = '/api/v1/analytics';

export interface SentimentDist {
  positive: number;
  neutral: number;
  negative: number;
}

export interface HotQuestion {
  message: string;
  count: number;
}

export interface HourlyPoint {
  hour: string;
  count: number;
}

export interface AnalyticsStats {
  totalVisits: number;
  todayVisits: number;
  sentimentDist: SentimentDist;
  hotQuestions: HotQuestion[];
  hourlyTrend: HourlyPoint[];
  updatedAt: string;
}

/**
 * 上报交互日志（埋点）
 */
export async function reportInteraction(params: {
  userId: string;
  message: string;
  response?: string;
  scenicSpot?: string;
}): Promise<{ id: number; sentimentScore: number; sentimentLabel: string }> {
  try {
    return await apiFetch<{ id: number; sentimentScore: number; sentimentLabel: string }>('/log', {
      apiPrefix: ANALYTICS_API_PREFIX,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  } catch (error) {
    console.error('[Analytics] 埋点上报失败', error);
    throw error;
  }
}

/**
 * 获取统计数据（初次加载）
 */
export async function getStats(): Promise<AnalyticsStats> {
  try {
    return await apiFetch<AnalyticsStats>('/stats', { apiPrefix: ANALYTICS_API_PREFIX });
  } catch (error) {
    console.error('[Analytics] 获取统计数据失败', error);
    throw error;
  }
}

/**
 * 建立 SSE 连接，实时接收统计数据推送
 * @param onStats 收到统计数据时的回调
 * @returns 关闭连接的函数
 */
export function connectStatsStream(onStats: (stats: AnalyticsStats) => void): () => void {
  const eventSource = new EventSource(`${API_BASE_URL}${ANALYTICS_API_PREFIX}/stream`);

  eventSource.addEventListener('stats', (event: MessageEvent) => {
    try {
      const stats = JSON.parse(event.data) as AnalyticsStats;
      onStats(stats);
    } catch (error) {
      console.error('[Analytics] SSE 数据解析失败', error);
    }
  });

  eventSource.addEventListener('connected', () => {
    console.info('[Analytics] SSE 连接已建立');
  });

  eventSource.onerror = () => {
    console.warn('[Analytics] SSE 连接异常，将自动重连...');
  };

  return () => {
    eventSource.close();
    console.info('[Analytics] SSE 连接已关闭');
  };
}
