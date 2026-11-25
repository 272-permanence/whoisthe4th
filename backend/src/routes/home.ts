/**
 * @file 首页聚合接口（成员D）
 * @author 第八组（成员D）
 * @date 2026-11-25（重写：接 MySQL product 表 + 加点赞收藏持久化 + 加快捷入口导航/商品）
 * @description
 *   一次请求返回移动端首页所有模块。
 *   所有可配置内容存 digital_human_config（键值对 JSON），后台改 JSON 即可实时生效。
 *   管理员可通过 ContentAdmin 页面或直接改 DB 维护。
 *
 *   数据源：
 *     - banners / quickEntries：digital_human_config 表（config_key = 'home_banners' / 'home_quick_entries'）
 *     - hotPois              ：poi 表，status=1 限 6
 *     - recommendedRoutes    ：route 表，status=1 限 3
 *     - stats                ：聚合 interaction_log + sentiment_data + product
 *     - hotProducts          ：SQLite product 表（成员C商品域，全站唯一商品数据源）
 *     - like/favorite        ：SQLite product_like 表（唯一键去重 + product 计数同步）
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../common/logger.js';
import { executeRead } from '../analytics/db.js';
import {
  listProducts,
  listHotProducts,
  findProductById,
  countProducts,
  toggleProductReaction,
} from '../services/authDb.js';

const log = createLogger('home');
const router = Router();

// ======================== 兜底默认值（DB 无配置时用） ========================

const DEFAULT_BANNERS = [
  { id: 1, title: '欢迎来到西湖景区 AI 导览', image: '', color: 'linear-gradient(135deg, #526F61, #8AA094)' },
  { id: 2, title: '智慧导览 · 沉浸式体验', image: '', color: 'linear-gradient(135deg, #4E8A68, #9DC8AF)' },
  { id: 3, title: '语音交互 · 数字人陪伴', image: '', color: 'linear-gradient(135deg, #C28C43, #E8C58C)' },
];

const DEFAULT_QUICK_ENTRIES = [
  { icon: 'service-o',   label: 'AI 导览',   path: '/interaction', color: '#526F61' },
  { icon: 'location-o',  label: '景色推荐',  path: '/pois',       color: '#4E8A68' },
  { icon: 'guide-o',     label: '游玩攻略',  path: '/routes',     color: '#C28C43' },
  { icon: 'location-o',  label: 'AI 导航',   path: '/navigate',   color: '#3A6B91' },
  { icon: 'records',     label: '失物招领',  path: '/lost-found', color: '#7B5EA7' },
  { icon: 'gift-o',      label: '特色商品',  path: '/products',   color: '#C45F55' },
];


/**
 * 从 digital_human_config 表读 JSON 配置
 * 找不到或 JSON 非法 → 返回 fallback
 */
async function readJsonConfig<T>(key: string, fallback: T): Promise<T> {
  try {
    const [row] = await executeRead<Array<{ config_value: string | null }>>(
      `SELECT config_value FROM digital_human_config WHERE config_key = ? LIMIT 1`,
      [key]
    );
    if (!row?.config_value) return fallback;
    return JSON.parse(row.config_value) as T;
  } catch {
    return fallback;
  }
}

// ======================== GET / 首页聚合 ========================

/** MySQL 分区读取：MySQL 不可用时返回兜底值，保证首页其余模块照常返回 */
async function safeRead<T>(sql: string, fallback: T): Promise<T> {
  try {
    return await executeRead<T>(sql);
  } catch (error) {
    log.WARN(`首页 MySQL 分区降级: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    // ---- 可配置模块：从 DB 读，失败用兜底值 ----
    const banners = await readJsonConfig('home_banners', DEFAULT_BANNERS);
    let quickEntries = await readJsonConfig('home_quick_entries', DEFAULT_QUICK_ENTRIES);

    // 兜底：确保快捷入口至少 6 个（导航 + 商品必须在）
    if (!Array.isArray(quickEntries) || quickEntries.length < 6) {
      quickEntries = DEFAULT_QUICK_ENTRIES;
    }

    // ---- 热门景点（MySQL，不可用则空） ----
    const hotPois = await safeRead<Array<{
      id: number; name: string; category: string; description?: string | null;
    }>>(
      `SELECT id, name, category, description
       FROM poi WHERE status = 1 ORDER BY created_at DESC LIMIT 6`,
      []
    );

    // ---- 推荐路线（MySQL，不可用则空） ----
    const recommendedRoutes = await safeRead<Array<{
      id: number; name: string; theme: string; description?: string | null; estimated_minutes: number;
    }>>(
      `SELECT id, name, theme, description, estimated_minutes
       FROM route WHERE status = 1 ORDER BY created_at DESC LIMIT 3`,
      []
    );

    // ---- 商品推荐（SQLite product 表，与 /api/v1/products 同一数据源） ----
    const hotProducts = listHotProducts(6);

    // ---- 运营统计（MySQL，不可用则 0） ----
    const [interactionsStat] = await safeRead<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM interaction_log`,
      []
    );
    const [todayStat] = await safeRead<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM interaction_log WHERE DATE(created_at) = CURDATE()`,
      []
    );
    const [positiveStat] = await safeRead<Array<{ rate: number | null }>>(
      `SELECT ROUND(
         SUM(CASE WHEN label = 'positive' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
         2
       ) AS rate FROM sentiment_data`,
      []
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        banners,
        quickEntries,
        hotPois,
        recommendedRoutes,
        hotProducts,
        stats: {
          totalInteractions: interactionsStat?.total ?? 0,
          todayInteractions: todayStat?.total ?? 0,
          positiveRate: positiveStat?.rate ?? 0,
          totalProducts: countProducts(),
        },
      },
    });
  } catch (error) {
    log.ERROR(`首页聚合接口异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '首页数据加载失败' });
  }
});

router.get('/products', (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json({ code: 0, message: 'ok', data: listProducts(category) });
});

// ======================== GET /products/:id 商品详情（公开） ========================
router.get('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: 40000, message: 'id 非法' });
    return;
  }
  const product = findProductById(id);
  if (!product) {
    res.status(404).json({ code: 40400, message: '商品不存在' });
    return;
  }
  res.json({ code: 0, message: 'ok', data: product });
});

// ======================== POST /products/:id/like 点赞（SQLite 持久化 + 去重） ========================
router.post('/products/:id/like', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: 40000, message: 'id 非法' });
    return;
  }
  if (!findProductById(id)) {
    res.status(404).json({ code: 40400, message: '商品不存在' });
    return;
  }
  const userId = (req.body?.userId as string) || 'anonymous';
  const { active, count } = toggleProductReaction(id, userId, 'like');
  res.json({
    code: 0,
    message: active ? '点赞成功' : '已取消点赞',
    data: { liked: active, likeCount: count },
  });
});

// ======================== POST /products/:id/favorite 收藏（SQLite 持久化 + 去重） ========================
router.post('/products/:id/favorite', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: 40000, message: 'id 非法' });
    return;
  }
  if (!findProductById(id)) {
    res.status(404).json({ code: 40400, message: '商品不存在' });
    return;
  }
  const userId = (req.body?.userId as string) || 'anonymous';
  const { active, count } = toggleProductReaction(id, userId, 'favorite');
  res.json({
    code: 0,
    message: active ? '收藏成功' : '已取消收藏',
    data: { favorited: active, favoriteCount: count },
  });
});

export default router;
