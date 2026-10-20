/**
 * @file 数据分析路由模块
 * @author 第八组
 * @date 2026-10-20
 * @description 埋点采集（写主库）、统计聚合（读从库）、SSE 实时推送
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { executeRead, executeWrite } from './db.js';
import { analyzeSentiment } from './sentiment.js';
import { sseBroker } from './sse-broker.js';
import { logger } from '../utils/logger.js';

const router = Router();
const PUSH_INTERVAL = 5000; // 每 5 秒推送一次统计数据

// 定时推送统计数据到所有 SSE 客户端，保存引用以便清理
const pushTimer = setInterval(async () => {
  if (sseBroker.getClientCount() > 0) {
    try {
      const stats = await computeStats();
      sseBroker.broadcast('stats', stats);
    } catch (error) {
      logger.error('定时推送统计数据失败', error);
    }
  }
}, PUSH_INTERVAL);

/**
 * 清理资源（应用关闭时调用）
 */
export function cleanupAnalytics(): void {
  clearInterval(pushTimer);
  sseBroker.shutdown();
  logger.info('analytics 模块资源已清理');
}

/**
 * POST /api/v1/analytics/log
 * 埋点采集：接收前端上报的交互日志，做情感分析后写入主库
 */
router.post('/log', async (req: Request, res: Response) => {
  const { userId, message, response, scenicSpot } = req.body || {};

  if (!userId || !message) {
    res.status(400).json({ code: 10001, message: 'userId 和 message 不能为空' });
    return;
  }

  try {
    // 情感分析
    const { score, label } = analyzeSentiment(message);

    // 写操作走主库
    const result = await executeWrite<{ insertId: number }>(
      `INSERT INTO interaction_log (user_id, message, response, sentiment_score, sentiment_label, scenic_spot)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, message, response || null, score, label, scenicSpot || null]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: { id: result.insertId, sentimentScore: score, sentimentLabel: label }
    });
  } catch (error) {
    logger.error('埋点数据写入失败', { userId, message }, error);
    res.status(500).json({ code: 10002, message: '服务器内部错误' });
  }
});

/**
 * GET /api/v1/analytics/stats
 * 获取当前统计数据（读操作走从库）
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await computeStats();
    res.json({ code: 0, message: 'ok', data: stats });
  } catch (error) {
    logger.error('获取统计数据失败', error);
    res.status(500).json({ code: 10003, message: '服务器内部错误' });
  }
});

/**
 * GET /api/v1/analytics/stream
 * SSE 实时推送统计数据
 */
router.get('/stream', async (req: Request, res: Response) => {
  const clientId = randomUUID();
  sseBroker.addClient(clientId, res);
  logger.info('SSE 客户端已连接', { clientId, total: sseBroker.getClientCount() });

  // 连接后立即推送一次当前数据
  try {
    const stats = await computeStats();
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  } catch (error) {
    logger.error('SSE 初始数据推送失败', error);
  }

  req.on('close', () => {
    sseBroker.removeClient(clientId);
    logger.info('SSE 客户端已断开', { clientId, remaining: sseBroker.getClientCount() });
  });
});

/**
 * 计算统计数据（读操作全部走从库）
 */
async function computeStats() {
  // 1. 总服务人次
  const totalRows = await executeRead<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM interaction_log'
  );
  const totalVisits = Number(totalRows[0]?.count ?? 0);

  // 2. 今日服务人次
  const todayRows = await executeRead<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM interaction_log WHERE DATE(created_at) = CURDATE()'
  );
  const todayVisits = Number(todayRows[0]?.count ?? 0);

  // 3. 情感分布
  const sentimentRows = await executeRead<{ sentiment_label: string; count: number }[]>(
    'SELECT sentiment_label, COUNT(*) as count FROM interaction_log GROUP BY sentiment_label'
  );

  const sentimentDist = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentRows) {
    if (row.sentiment_label in sentimentDist) {
      (sentimentDist as Record<string, number>)[row.sentiment_label] = Number(row.count);
    }
  }

  // 4. 热门问答 TOP10
  const hotQuestions = await executeRead<{ message: string; count: number }[]>(
    `SELECT message, COUNT(*) as count
     FROM interaction_log
     GROUP BY message
     ORDER BY count DESC
     LIMIT 10`
  );

  // 5. 近 24 小时问答量趋势（按小时聚合）
  const hourlyRows = await executeRead<{ hour: string; count: number }[]>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour, COUNT(*) as count
     FROM interaction_log
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 23 HOUR)
     GROUP BY hour
     ORDER BY hour`
  );

  // 补全 24 小时的数据点
  const trend = build24HourTrend(hourlyRows.map(r => ({ hour: r.hour, count: Number(r.count) })));

  return {
    totalVisits,
    todayVisits,
    sentimentDist,
    hotQuestions: hotQuestions.map(r => ({ message: r.message, count: Number(r.count) })),
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
