/**
 * @file 数据分析路由模块
 * @author 第八组
 * @date 2026-10-15
 * @description 埋点采集、统计聚合、SSE 实时推送
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from './db.js';
import { analyzeSentiment } from './sentiment.js';
import { sseBroker } from './sse-broker.js';

const router = Router();
const PUSH_INTERVAL = 5000; // 每 5 秒推送一次统计数据

// 定时推送统计数据到所有 SSE 客户端
setInterval(() => {
  if (sseBroker.getClientCount() > 0) {
    const stats = computeStats();
    sseBroker.broadcast('stats', stats);
  }
}, PUSH_INTERVAL);

/**
 * POST /api/v1/analytics/log
 * 埋点采集：接收前端上报的交互日志，做情感分析后存入数据库
 */
router.post('/log', (req: Request, res: Response) => {
  const { userId, message, response, scenicSpot } = req.body || {};

  if (!userId || !message) {
    res.status(400).json({ code: 10001, message: 'userId 和 message 不能为空' });
    return;
  }

  // 情感分析
  const { score, label } = analyzeSentiment(message);

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO interaction_log (user_id, message, response, sentiment_score, sentiment_label, scenic_spot)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(userId, message, response || null, score, label, scenicSpot || null);

  res.json({
    code: 0,
    message: 'ok',
    data: { id: info.lastInsertRowid, sentimentScore: score, sentimentLabel: label }
  });
});

/**
 * GET /api/v1/analytics/stats
 * 获取当前统计数据（前端初次加载时调用）
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = computeStats();
  res.json({ code: 0, message: 'ok', data: stats });
});

/**
 * GET /api/v1/analytics/stream
 * SSE 实时推送统计数据
 */
router.get('/stream', (_req: Request, res: Response) => {
  const clientId = randomUUID();
  // 客户端断开后的清理已由 sseBroker.addClient 内部的 res.on('close') 统一负责。
  // 此处不再监听 req 的 close：Express 4 / Node 16+ 下 req 可能提前触发 close，
  // 反而会把仍然存活的客户端从广播列表里摘掉（chat.ts 曾因此导致 SSE 提前终止）。
  sseBroker.addClient(clientId, res);

  // 连接后立即推送一次当前数据
  const stats = computeStats();
  res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
});

/**
 * 计算统计数据
 */
function computeStats() {
  const db = getDb();

  // 1. 总服务人次
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM interaction_log').get() as { count: number };
  const totalVisits = totalRow.count;

  // 2. 今日服务人次
  const todayRow = db.prepare(
    "SELECT COUNT(*) as count FROM interaction_log WHERE date(created_at) = date('now')"
  ).get() as { count: number };
  const todayVisits = todayRow.count;

  // 3. 情感分布
  const sentimentRows = db.prepare(
    'SELECT sentiment_label, COUNT(*) as count FROM interaction_log GROUP BY sentiment_label'
  ).all() as { sentiment_label: string; count: number }[];

  const sentimentDist = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentRows) {
    if (row.sentiment_label in sentimentDist) {
      (sentimentDist as Record<string, number>)[row.sentiment_label] = row.count;
    }
  }

  // 4. 热门问答 TOP10
  const hotQuestions = db.prepare(
    `SELECT message, COUNT(*) as count
     FROM interaction_log
     GROUP BY message
     ORDER BY count DESC
     LIMIT 10`
  ).all() as { message: string; count: number }[];

  // 5. 近 24 小时问答量趋势（按小时聚合）
  const hourlyRows = db.prepare(
    `SELECT strftime('%Y-%m-%d %H:00:00', created_at) as hour, COUNT(*) as count
     FROM interaction_log
     WHERE created_at >= datetime('now', '-23 hours')
     GROUP BY hour
     ORDER BY hour`
  ).all() as { hour: string; count: number }[];

  // 补全 24 小时的数据点
  const trend = build24HourTrend(hourlyRows);

  return {
    totalVisits,
    todayVisits,
    sentimentDist,
    hotQuestions,
    hourlyTrend: trend,
    updatedAt: new Date().toISOString()
  };
}

/**
 * 补全 24 小时趋势数据
 */
function build24HourTrend(rows: { hour: string; count: number }[]): { hour: string; count: number }[] {
  const now = new Date();
  const result: { hour: string; count: number }[] = [];
  const rowMap = new Map(rows.map(r => [r.hour, r.count]));

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(d.getHours() - i, 0, 0, 0);
    const hourKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`;
    result.push({
      hour: `${pad(d.getHours())}:00`,
      count: rowMap.get(hourKey) || 0
    });
  }
  return result;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export default router;
