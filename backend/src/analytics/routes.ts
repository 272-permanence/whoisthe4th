/**
 * @file 数据分析路由模块
 * @author 第八组
 * @date 2026-10-15
 * @description 埋点采集、统计聚合、SSE 实时推送、审计接口、行为分析、推荐铺垫
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type Redis from 'ioredis';
import { executeRead, executeWrite, getDb } from './db.js';
import { analyzeSentiment } from './sentiment.js';
import { sseBroker } from './sse-broker.js';
import { ErrorCodeEnum } from '../common/errorCodes.js';
import { createLogger } from '../common/logger.js';
import { config } from '../config.js';
import { getRedisClient, getSubscriberClient } from '../common/redis.js';

const log = createLogger('analytics');

const router = Router();
const PUSH_INTERVAL = 5000; // 每 5 秒推送一次统计数据
/** 大屏推送分布式锁的持有时间，需大于推送间隔，避免每个节点各推一份 */
const PUSH_LOCK_TTL_MS = 15_000;
/** 当前节点的唯一标识，用于 Redis 分布式锁判断归属 */
const nodeId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

let pushTimer: NodeJS.Timeout | null = null;
let statsSubscriber: Redis | null = null;

/**
 * 启动大屏统计推送（应用启动时调用）
 * - Redis 可用：抢到锁的节点算统计并 publish，所有节点订阅后推给本机 SSE 客户端，
 *   从而让 Tomcat 多节点部署时大屏也能收到同一个数据源
 * - Redis 不可用：退化为原有逻辑，仅当本机有客户端时本地计算并广播
 */
export async function startAnalyticsPush(): Promise<void> {
  if (pushTimer) return;

  if (getRedisClient()) {
    const subscriber = await getSubscriberClient();
    if (subscriber) {
      statsSubscriber = subscriber;
      await subscriber.subscribe(config.redis.statsChannel);
      subscriber.on('message', (channel, message) => {
        if (channel !== config.redis.statsChannel) return;
        try {
          sseBroker.broadcast('stats', JSON.parse(message));
        } catch (error) {
          log.WARN(`统计消息解析失败: ${String(error)}`);
        }
      });
      log.INFO(`大屏统计已接入 Redis Pub/Sub channel=${config.redis.statsChannel}`);
    }
  } else {
    log.WARN('Redis 未就绪，大屏统计降级为本机 SSE 广播');
  }

  pushTimer = setInterval(() => {
    void pushStats();
  }, PUSH_INTERVAL);
}

/**
 * 清理资源（应用关闭时调用）
 */
export async function cleanupAnalytics(): Promise<void> {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  if (statsSubscriber) {
    const subscriber = statsSubscriber;
    statsSubscriber = null;
    try {
      await subscriber.unsubscribe(config.redis.statsChannel);
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  }
  sseBroker.shutdown();
  log.INFO('analytics 模块资源已清理');
}

/**
 * 一次统计推送：Redis 可用时走「分布式锁 + Pub/Sub」，否则本机计算广播
 */
async function pushStats(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    if (sseBroker.getClientCount() === 0) return;
    try {
      const stats = await computeStats();
      sseBroker.broadcast('stats', stats);
    } catch (error) {
      log.ERROR(`本机统计推送失败: ${String(error)}`);
    }
    return;
  }

  try {
    if (!(await isPushLeader(redis))) return;
    const stats = await computeStats();
    await redis.publish(config.redis.statsChannel, JSON.stringify(stats));
  } catch (error) {
    log.ERROR(`统计推送失败: ${String(error)}`);
  }
}

/**
 * 抢占/续期大屏推送锁
 * @returns 当前节点是否为本轮推送的唯一发布者
 */
async function isPushLeader(redis: Redis): Promise<boolean> {
  const key = config.redis.statsLockKey;

  if ((await redis.get(key)) === nodeId) {
    await redis.pexpire(key, PUSH_LOCK_TTL_MS);
    return true;
  }

  const acquired = await redis.set(key, nodeId, 'PX', PUSH_LOCK_TTL_MS, 'NX');
  return acquired === 'OK';
}

// =============================================================================
// 基础接口（埋点 / 统计 / SSE）
// =============================================================================

/**
 * POST /api/v1/analytics/log
 * 埋点采集：接收前端上报的交互日志，做情感分析后存入数据库
 */
router.post('/log', (req: Request, res: Response) => {
  const { userId, message, response, scenicSpot } = req.body || {};

  if (!userId || !message) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'userId 和 message 不能为空' });
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
  // 客户端断开后的清理已由 sseBroker.addClient 内部的 res.on('close') 统一负责
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

// =============================================================================
// 审计接口（管理员专属）
// =============================================================================

/**
 * GET /api/v1/analytics/audit/login-abnormal
 * 同一 IP 1 小时内 ≥3 次登录失败（暴力破解嫌疑）
 */
router.get('/audit/login-abnormal', async (_req: Request, res: Response) => {
  try {
    const rows = await executeRead<Array<{
      ip: string; fail_count: number; first_fail: string; last_fail: string;
    }>>(
      `SELECT ip,
              COUNT(*) AS fail_count,
              MIN(created_at) AS first_fail,
              MAX(created_at) AS last_fail
       FROM login_log
       WHERE login_result LIKE 'fail%'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
       GROUP BY ip
       HAVING fail_count >= 3
       ORDER BY fail_count DESC`
    );

    res.json({
      code: 0,
      message: 'ok',
      data: rows.map(r => ({
        ip: r.ip,
        failCount: Number(r.fail_count),
        firstFail: r.first_fail,
        lastFail: r.last_fail,
      })),
    });
  } catch (error) {
    log.ERROR(`登录异常审计失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '登录异常审计失败' });
  }
});

/**
 * GET /api/v1/analytics/audit/sensitive-ops
 * 管理员敏感操作：删除/修改景点、修改用户权限等
 */
router.get('/audit/sensitive-ops', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    const rows = await executeRead<Record<string, unknown>[]>(
      `SELECT * FROM operation_log
       WHERE
         (http_method = 'DELETE' AND api_path LIKE '%/poi%')
         OR (http_method = 'PUT' AND api_path LIKE '%/poi%')
         OR (http_method IN ('PUT', 'POST', 'DELETE')
             AND (api_path LIKE '%/user%' OR api_path LIKE '%/permission%' OR api_path LIKE '%/role%'))
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({ code: 0, message: 'ok', data: rows });
  } catch (error) {
    log.ERROR(`敏感操作审计失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '敏感操作审计失败' });
  }
});

// =============================================================================
// 行为分析接口
// =============================================================================

/**
 * GET /api/v1/analytics/behaviors/hot-pois
 * 热门景点 Top10（按 operation_log 中访问 poi/:id 的次数统计）
 */
router.get('/behaviors/hot-pois', async (_req: Request, res: Response) => {
  try {
    const rows = await executeRead<Array<{ poi_id: number; visit_count: number; name: string | null }>>(
      `SELECT
         CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.api_path, '/poi/', -1), '?', 1) AS UNSIGNED) AS poi_id,
         COUNT(*) AS visit_count,
         p.name
       FROM operation_log o
       LEFT JOIN poi p ON p.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.api_path, '/poi/', -1), '?', 1) AS UNSIGNED)
       WHERE o.api_path LIKE '%/poi/%'
         AND o.http_method = 'GET'
       GROUP BY poi_id, p.name
       ORDER BY visit_count DESC
       LIMIT 10`
    );

    res.json({
      code: 0,
      message: 'ok',
      data: rows.map(r => ({
        poiId: Number(r.poi_id),
        name: r.name || `景点#${r.poi_id}`,
        visitCount: Number(r.visit_count),
      })),
    });
  } catch (error) {
    log.ERROR(`热门景点统计失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '热门景点统计失败' });
  }
});

/**
 * GET /api/v1/analytics/behaviors/path
 * 用户行为路径（按 traceId 串联的操作序列）
 * query: traceId（可选，指定则返回该 trace 的完整序列；否则返回最近 N 条 trace 的路径）
 */
router.get('/behaviors/path', async (req: Request, res: Response) => {
  try {
    const traceId = (req.query.traceId as string)?.trim();

    if (traceId) {
      const steps = await executeRead<Record<string, unknown>[]>(
        `SELECT * FROM operation_log WHERE trace_id = ? ORDER BY created_at ASC`,
        [traceId]
      );
      res.json({ code: 0, message: 'ok', data: { traceId, steps } });
      return;
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const rows = await executeRead<Array<{
      trace_id: string; step_count: number; started_at: string; ended_at: string; path: string;
    }>>(
      `SELECT trace_id,
              COUNT(*) AS step_count,
              MIN(created_at) AS started_at,
              MAX(created_at) AS ended_at,
              GROUP_CONCAT(CONCAT(http_method, ' ', api_path) ORDER BY created_at SEPARATOR ' -> ') AS path
       FROM operation_log
       GROUP BY trace_id
       ORDER BY started_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: rows.map(r => ({
        traceId: r.trace_id,
        stepCount: Number(r.step_count),
        startedAt: r.started_at,
        endedAt: r.ended_at,
        path: r.path,
      })),
    });
  } catch (error) {
    log.ERROR(`行为路径分析失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '行为路径分析失败' });
  }
});

/**
 * GET /api/v1/analytics/behaviors/active-hours
 * 活跃时段分布（按小时聚合 operation_log）
 */
router.get('/behaviors/active-hours', async (_req: Request, res: Response) => {
  try {
    const rows = await executeRead<Array<{ hour: number; count: number }>>(
      `SELECT HOUR(created_at) AS hour, COUNT(*) AS count
       FROM operation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY hour
       ORDER BY hour`
    );

    // 补全 24 小时
    const dist = new Array(24).fill(0);
    for (const r of rows) {
      dist[Number(r.hour)] = Number(r.count);
    }

    res.json({
      code: 0,
      message: 'ok',
      data: dist.map((count, hour) => ({ hour, count })),
    });
  } catch (error) {
    log.ERROR(`活跃时段统计失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '活跃时段统计失败' });
  }
});

// =============================================================================
// 推荐铺垫接口（规则版，基于 operation_log 聚合）
// =============================================================================

/**
 * GET /api/v1/analytics/recommend/related-pois?poiId=XX
 * 「看过这个景点的人还看过」—— 基于相同 traceId 下的其他 poi 访问记录
 */
router.get('/recommend/related-pois', async (req: Request, res: Response) => {
  try {
    const poiId = Number(req.query.poiId);
    if (!Number.isFinite(poiId) || poiId <= 0) {
      res.status(400).json({ code: 40001, message: 'poiId 无效' });
      return;
    }

    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));

    const rows = await executeRead<Array<{ poi_id: number; co_visit_count: number; name: string | null }>>(
      `SELECT
         CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.api_path, '/poi/', -1), '?', 1) AS UNSIGNED) AS poi_id,
         COUNT(*) AS co_visit_count,
         p.name
       FROM operation_log o
       LEFT JOIN poi p ON p.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(o.api_path, '/poi/', -1), '?', 1) AS UNSIGNED)
       WHERE o.api_path LIKE '%/poi/%'
         AND o.http_method = 'GET'
         AND o.trace_id IN (
           SELECT DISTINCT trace_id FROM operation_log
           WHERE api_path LIKE '%/poi/%'
             AND http_method = 'GET'
             AND CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(api_path, '/poi/', -1), '?', 1) AS UNSIGNED) = ?
         )
       GROUP BY poi_id, p.name
       HAVING poi_id <> ?
       ORDER BY co_visit_count DESC
       LIMIT ?`,
      [poiId, poiId, limit]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        sourcePoiId: poiId,
        related: rows.map(r => ({
          poiId: Number(r.poi_id),
          name: r.name || `景点#${r.poi_id}`,
          coVisitCount: Number(r.co_visit_count),
        })),
      },
    });
  } catch (error) {
    log.ERROR(`相关景点推荐失败 poiId=${req.query.poiId}: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '相关景点推荐失败' });
  }
});

export default router;
