/**
 * @file 数据分析接口封装
 * @author 第八组
 * @date 2026-10-15
 * @description 埋点上报、统计查询、SSE 实时推送
 */

const BASE_URL = 'http://localhost:3000/api/v1/analytics';

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
  const res = await fetch(`${BASE_URL}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const json = await res.json();
  return json.data;
}

/**
 * 获取统计数据（初次加载）
 */
export async function getStats(): Promise<AnalyticsStats> {
  const res = await fetch(`${BASE_URL}/stats`);
  const json = await res.json();
  return json.data;
}

/**
 * 建立 SSE 连接，实时接收统计数据推送
 * @param onStats 收到统计数据时的回调
 * @returns 关闭连接的函数
 */
export function connectStatsStream(onStats: (stats: AnalyticsStats) => void): () => void {
  const eventSource = new EventSource(`${BASE_URL}/stream`);

  eventSource.addEventListener('stats', (event: MessageEvent) => {
    const stats = JSON.parse(event.data) as AnalyticsStats;
    onStats(stats);
  });

  eventSource.addEventListener('connected', () => {
    console.log('[Analytics] SSE 连接已建立');
  });

  eventSource.onerror = () => {
    console.warn('[Analytics] SSE 连接异常，将自动重连...');
  };

  return () => {
    eventSource.close();
  };
}
