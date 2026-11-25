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
import { executeRead, executeWrite } from './db.js';
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
export async function startAnalyticsPush(): Promise<void> {// 启动大屏统计推送
  if (pushTimer) return;

  if (getRedisClient()) {
    const subscriber = await getSubscriberClient();
    if (subscriber) {
      statsSubscriber = subscriber;
      await subscriber.subscribe(config.redis.statsChannel);
      subscriber.on('message', (channel, message) => {
        if (channel !== config.redis.statsChannel) return;// 过滤非统计消息
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
    void pushStats();// 每 5 秒推送一次统计数据,执行统计推送
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
    if (!(await isPushLeader(redis))) return;// 仅抢到锁的节点算统计并 publish,竞争分布式锁
    const stats = await computeStats();// 计算统计数据
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
 * 埋点采集：接收前端上报的交互日志，做情感分析后存入 MySQL
 */
router.post('/log', async (req: Request, res: Response) => {
  const { userId, message, response, scenicSpot, userRating } = req.body || {};

  if (!userId || !message) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'userId 和 message 不能为空' });
    return;
  }

  // 用户显式好评/差评优先，跳过词典分析
  let score: number;
  let label: 'positive' | 'neutral' | 'negative';
  let model: string;
  if (userRating === 'positive' || userRating === 'negative') {
    label = userRating;
    score = userRating === 'positive' ? 0.8 : -0.8;
    model = 'user-explicit';
  } else {
    const s = analyzeSentiment(message);
    score = s.score;
    label = s.label;
    model = 'lexicon-v1';
  }

  // 写 MySQL interaction_log + sentiment_data
  const insertResult = await executeWrite<{ insertId: number }>(
    `INSERT INTO interaction_log (user_id, message, response, scenic_spot)
     VALUES (?, ?, ?, ?)`,
    [userId, message, response || null, scenicSpot || null]
  );
  await executeWrite(
    `INSERT INTO sentiment_data (log_id, score, label, model) VALUES (?, ?, ?, ?)`,
    [insertResult.insertId, score, label, model]
  );

  res.json({
    code: 0,
    message: 'ok',
    data: { id: insertResult.insertId, sentimentScore: score, sentimentLabel: label }
  });
});

/**
 * GET /api/v1/analytics/stats
 * 获取当前统计数据（前端初次加载时调用）
 */
router.get('/stats', async (_req: Request, res: Response) => {
  const stats = await computeStats();
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

  // 连接后立即推送一次当前数据（异步拉取，不阻塞 SSE 握手）
  void computeStats().then(stats => {
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  }).catch(err => {
    log.ERROR(`stream 首推失败: ${String(err)}`);
  });
});

/**
 * 计算统计数据（统一走 MySQL 从库 executeRead）
 */
async function computeStats() {
  // 1. 总服务人次
  const totalRow = await executeRead<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM interaction_log'
  );
  const totalVisits = Number(totalRow[0]?.count ?? 0);

  // 2. 今日服务人次
  const todayRow = await executeRead<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM interaction_log WHERE DATE(created_at) = CURDATE()'
  );
  const todayVisits = Number(todayRow[0]?.count ?? 0);

  // 3. 情感分布（从 sentiment_data 表查，label ENUM('positive','neutral','negative')）
  const sentimentRows = await executeRead<{ label: string; count: number }[]>(
    'SELECT label, COUNT(*) as count FROM sentiment_data GROUP BY label'
  );

  const sentimentDist = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentimentRows) {
    const key = row.label as keyof typeof sentimentDist;
    if (key in sentimentDist) {
      sentimentDist[key] = Number(row.count);
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

  // ========== 失物招领统计 ==========
  // 6. 状态分布（open 待处理 / resolved 已解决 / expired 已过期）
  const lfStatusRows = await executeRead<{ status: string; count: number }[]>(
    `SELECT status, COUNT(*) as count FROM lost_found GROUP BY status`
  );
  const lfStatusDist = { open: 0, resolved: 0, expired: 0 };
  for (const row of lfStatusRows) {
    if (row.status in lfStatusDist) {
      (lfStatusDist as Record<string, number>)[row.status] = Number(row.count);
    }
  }
  const lfTotal = lfStatusDist.open + lfStatusDist.resolved + lfStatusDist.expired;

  // 7. 类型分布（lost 丢失 / found 捡到）
  const lfTypeRows = await executeRead<{ type: string; count: number }[]>(
    `SELECT type, COUNT(*) as count FROM lost_found GROUP BY type`
  );
  const lfTypeDist = { lost: 0, found: 0 };
  for (const row of lfTypeRows) {
    if (row.type in lfTypeDist) {
      (lfTypeDist as Record<string, number>)[row.type] = Number(row.count);
    }
  }

  // 8. 今日新增
  const lfTodayRows = await executeRead<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM lost_found WHERE DATE(created_at) = CURDATE()`
  );
  const lfTodayCount = Number(lfTodayRows[0]?.count ?? 0);

  // 9. 热门分类 TOP5
  const lfCategoryRows = await executeRead<{ category: string; count: number }[]>(
    `SELECT category, COUNT(*) as count FROM lost_found
     GROUP BY category ORDER BY count DESC LIMIT 5`
  );
  const lfTopCategories = lfCategoryRows.map(r => ({ category: r.category, count: Number(r.count) }));

  // 10. 近 24 小时失物招领新增趋势
  const lfHourlyRows = await executeRead<{ hour: string; count: number }[]>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') as hour, COUNT(*) as count
     FROM lost_found
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 23 HOUR)
     GROUP BY hour
     ORDER BY hour`
  );
  const lfTrend = build24HourTrend(lfHourlyRows.map(r => ({ hour: r.hour, count: Number(r.count) })));

  return {
    totalVisits,
    todayVisits,
    sentimentDist,
    hotQuestions: hotQuestions.map(r => ({ message: r.message, count: Number(r.count) })),
    hourlyTrend: trend,
    lostFound: {
      total: lfTotal,
      todayCount: lfTodayCount,
      statusDist: lfStatusDist,
      typeDist: lfTypeDist,
      topCategories: lfTopCategories
    },
    lfTrend,
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
// 用户画像接口（基于 operation_log 前端埋点聚合）
// =============================================================================

/** 一条前端点击/行为埋点行 */
interface TrackEventRow {
  trace_id: string;
  user_id: number | null;
  api_path: string;
  request_params: string | null;
  created_at: string | Date;
}

/** 安全解析 request_params（历史数据可能是坏 JSON） */
function parseTrackParams(raw: TrackEventRow['request_params']): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/v1/analytics/users
 * 有埋点数据的用户列表（按事件数倒序），供大屏画像 Tab 选择
 */
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const rows = await executeRead<Array<{ user_id: number; event_count: number; last_active: string | Date }>>(
      `SELECT user_id,
              COUNT(*) AS event_count,
              MAX(created_at) AS last_active
       FROM operation_log
       WHERE http_method = 'CLICK'
         AND user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY event_count DESC
       LIMIT 20`
    );

    res.json({
      code: 0,
      message: 'ok',
      data: rows.map(r => ({
        userId: Number(r.user_id),
        eventCount: Number(r.event_count),
        lastActive: r.last_active,
      })),
    });
  } catch (error) {
    log.ERROR(`用户列表查询失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '用户列表查询失败' });
  }
});

/**
 * GET /api/v1/analytics/users/profile?userId=1&days=7
 * 单个用户的行为画像：五类行为计数、平均停留、活跃时段、偏好对象、标签
 */
router.get('/users/profile', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.userId);
    if (!Number.isFinite(userId) || userId < 0) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'userId 无效' });
      return;
    }
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));

    const rows = await executeRead<TrackEventRow[]>(
      `SELECT trace_id, user_id, api_path, request_params, created_at
       FROM operation_log
       WHERE http_method = 'CLICK'
         AND user_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
       ORDER BY created_at DESC
       LIMIT 5000`,
      [userId]
    );

    const actions: Record<string, number> = { click: 0, like: 0, favorite: 0, share: 0, dwell: 0 };
    const targetMap = new Map<string, { resourceType: string; resourceId: string; count: number }>();
    const activeHours = new Array<number>(24).fill(0);
    let dwellTotal = 0;
    let dwellCount = 0;

    for (const row of rows) {
      const params = parseTrackParams(row.request_params);
      const action = String(params.action ?? 'click').toLowerCase();
      // 五类行为之外的历史动作（view/detail/navigate 等）统一计入点击
      if (action === 'like' || action === 'favorite' || action === 'share' || action === 'dwell') {
        actions[action] += 1;
      } else {
        actions.click += 1;
      }

      if (action === 'dwell') {
        const extra = params.extra && typeof params.extra === 'object'
          ? (params.extra as Record<string, unknown>)
          : {};
        const duration = Number(params.duration ?? extra.duration ?? 0);
        if (Number.isFinite(duration) && duration > 0) {
          dwellTotal += duration;
          dwellCount += 1;
        }
      }

      const resourceType = String(params.resourceType ?? 'unknown');
      // 兼容历史数据里的 poi-1001 形式，统一成数字 ID 方便关联景点名称
      const resourceId = String(params.resourceId ?? '').replace(/^poi-/, '');
      if (resourceId) {
        const key = `${resourceType}:${resourceId}`;
        const item = targetMap.get(key) ?? { resourceType, resourceId, count: 0 };
        item.count += 1;
        targetMap.set(key, item);
      }

      const created = row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at));
      const hour = created.getHours();
      if (Number.isFinite(hour) && hour >= 0 && hour < 24) activeHours[hour] += 1;
    }

    // 资源 ID 是数字时补齐 POI 名称，画像里展示更直观
    const poiIds = [...new Set(
      [...targetMap.values()]
        .filter(t => ['poi', 'poi-card', 'spot'].includes(t.resourceType) && /^\d+$/.test(t.resourceId))
        .map(t => Number(t.resourceId))
        .filter(id => Number.isFinite(id) && id > 0)
    )];
    const poiNameMap = new Map<number, string>();
    if (poiIds.length > 0) {
      const placeholders = poiIds.map(() => '?').join(',');
      const poiRows = await executeRead<Array<{ id: number; name: string }>>(
        `SELECT id, name FROM poi WHERE id IN (${placeholders})`,
        poiIds
      );
      for (const poi of poiRows) poiNameMap.set(Number(poi.id), poi.name);
    }

    const totalEvents = rows.length;
    const rate = (count: number): number => totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;

    const topTargets = [...targetMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(t => ({
        ...t,
        name: poiNameMap.get(Number(t.resourceId)) ?? (t.resourceType === 'poi' ? `景点#${t.resourceId}` : t.resourceType),
      }));

    const avgDwellSeconds = dwellCount > 0 ? Math.round(dwellTotal / dwellCount) : 0;

    const tags: Array<{ label: string; weight: number }> = [];
    if (totalEvents >= 10) tags.push({ label: '高频活跃', weight: Math.min(100, totalEvents * 5) });
    if (actions.like > 0) tags.push({ label: '偏好点赞', weight: rate(actions.like) });
    if (actions.favorite > 0) tags.push({ label: '收藏倾向', weight: rate(actions.favorite) });
    if (actions.share > 0) tags.push({ label: '分享传播', weight: rate(actions.share) });
    if (avgDwellSeconds >= 30) tags.push({ label: '深度浏览', weight: Math.min(100, avgDwellSeconds) });
    if (topTargets[0]) tags.push({ label: `偏好${topTargets[0].name}`, weight: rate(topTargets[0].count) });
    tags.sort((a, b) => b.weight - a.weight);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        userId,
        days,
        totalEvents,
        clickCount: actions.click,
        likeCount: actions.like,
        favoriteCount: actions.favorite,
        shareCount: actions.share,
        dwellCount: actions.dwell,
        avgDwellSeconds,
        lastActiveAt: rows[0]?.created_at ?? null,
        activeHours,
        topTargets,
        tags,
        recentEvents: rows.slice(0, 10).map(r => {
          const params = parseTrackParams(r.request_params);
          return {
            action: String(params.action ?? 'click'),
            resourceType: String(params.resourceType ?? ''),
            resourceId: String(params.resourceId ?? ''),
            pagePath: r.api_path,
            createdAt: r.created_at,
          };
        }),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.ERROR(`用户画像聚合失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '用户画像聚合失败' });
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
           SELECT DISTINCT trace_id FROM operation_log // 内层查询：筛选出访问该 poi 的 traceId
           WHERE api_path LIKE '%/poi/%'
             AND http_method = 'GET'
             AND CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(api_path, '/poi/', -1), '?', 1) AS UNSIGNED) = ?
         )
       GROUP BY poi_id, p.name
       HAVING poi_id <> ? // 排除当前 poi 自身
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
