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
 *     - hotProducts          ：product 表（MySQL），status=1 按 like_count 排序限 6
 *     - like/favorite        ：product_like 表（MySQL）唯一键去重 + product 表计数同步
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../common/logger.js';
import { executeRead, executeWrite } from '../analytics/db.js';

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

// ======================== Product 表初始化（MySQL，D 自己建，不碰 C 的 SQLite product） ========================
// 仅执行一次，幂等

let productTablesReady = false;

const PRODUCT_SEED: Array<{
  id: number; name: string; description: string; price: number; stock: number;
  category: string; image_url: string; like_count: number; favorite_count: number; sales: number;
}> = [
  { id: 1, name: '西湖龙井茶叶礼盒', description: '特级明前龙井 100g 礼盒装，适合伴手礼',
    price: 388.00, stock: 200, category: '特产',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖龙井茶叶礼盒 传统风格 简洁素雅&image_size=square_hd',
    like_count: 42, favorite_count: 18, sales: 76 },
  { id: 2, name: '王星记扇子', description: '杭州老字号王星记真丝手绘折扇',
    price: 128.00, stock: 500, category: '纪念品',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=王星记扇子 杭州特产 真丝手绘折扇 精致&image_size=square_hd',
    like_count: 23, favorite_count: 11, sales: 132 },
  { id: 3, name: '西湖绸伞', description: '杭州特色丝绸伞，西湖十景图案',
    price: 218.00, stock: 150, category: '纪念品',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖绸伞 杭州 中国风 江南&image_size=square_hd',
    like_count: 31, favorite_count: 15, sales: 58 },
  { id: 4, name: '张小泉剪刀套装', description: '百年老字号张小泉家用剪刀四件套',
    price: 99.00, stock: 800, category: '日用品',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=张小泉剪刀 老字号 金属质感 精美包装&image_size=square_hd',
    like_count: 17, favorite_count: 6, sales: 201 },
  { id: 5, name: '龙井茶糕', description: '龙井绿茶风味传统糕点，伴手礼首选',
    price: 58.00, stock: 300, category: '食品',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=龙井茶糕 绿色 传统糕点 精致&image_size=square_hd',
    like_count: 28, favorite_count: 9, sales: 155 },
  { id: 6, name: '西湖十景明信片', description: '手绘版西湖十景明信片套装 10张',
    price: 38.00, stock: 1000, category: '文创',
    image_url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖十景明信片 手绘 文艺 清新&image_size=square_hd',
    like_count: 15, favorite_count: 4, sales: 312 },
];

export async function initProductTables(): Promise<void> {
  if (productTablesReady) return;
  try {
    // 先清掉上一次失败的半成品表（DROP + recreate），幂等安全
    try { await executeWrite('DROP TABLE IF EXISTS product_like'); } catch {}
    try { await executeWrite('DROP TABLE IF EXISTS product'); } catch {}

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS product (
        id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name           VARCHAR(200) NOT NULL,
        description    MEDIUMTEXT NULL,
        price          DECIMAL(10,2) NOT NULL DEFAULT 0,
        stock          INT UNSIGNED NOT NULL DEFAULT 0,
        category       VARCHAR(100) NULL,
        image_url      VARCHAR(500) NULL,
        like_count     INT UNSIGNED NOT NULL DEFAULT 0,
        favorite_count INT UNSIGNED NOT NULL DEFAULT 0,
        sales          INT UNSIGNED NOT NULL DEFAULT 0,
        status         TINYINT NOT NULL DEFAULT 1,
        created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME NULL,
        INDEX idx_product_category (category),
        INDEX idx_product_status (status),
        INDEX idx_product_like (like_count)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表（成员D · 首页展示 + 点赞收藏持久化）'
    `);

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS product_like (
        id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id   INT UNSIGNED NOT NULL,
        user_id      VARCHAR(100) NOT NULL DEFAULT 'anonymous',
        action       ENUM('like','favorite') NOT NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_product_user_action (product_id, user_id, action),
        INDEX idx_product_like_pid (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品点赞/收藏记录（成员D · 去重持久化）'
    `);

    // 首次启动灌入种子数据（幂等，INSERT IGNORE）
    for (const p of PRODUCT_SEED) {
      await executeWrite(
        `INSERT IGNORE INTO product
           (id, name, description, price, stock, category, image_url, like_count, favorite_count, sales, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [p.id, p.name, p.description, p.price, p.stock, p.category, p.image_url, p.like_count, p.favorite_count, p.sales]
      );
    }

    productTablesReady = true;
    log.INFO('product / product_like 表初始化 + seed 成功');
  } catch (error) {
    log.WARN(`product 表初始化失败（忽略）: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 启动时立即初始化一次（不阻塞）
void initProductTables();

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

router.get('/', async (_req: Request, res: Response) => {
  try {
    // 确保 product 表就绪
    await initProductTables();

    // ---- 可配置模块：从 DB 读，失败用兜底值 ----
    const banners = await readJsonConfig('home_banners', DEFAULT_BANNERS);
    let quickEntries = await readJsonConfig('home_quick_entries', DEFAULT_QUICK_ENTRIES);

    // 兜底：确保快捷入口至少 6 个（导航 + 商品必须在）
    if (!Array.isArray(quickEntries) || quickEntries.length < 6) {
      quickEntries = DEFAULT_QUICK_ENTRIES;
    }

    // ---- 热门景点 ----
    const hotPois = await executeRead<Array<{
      id: number; name: string; category: string; description?: string | null;
    }>>(
      `SELECT id, name, category, description
       FROM poi WHERE status = 1 ORDER BY created_at DESC LIMIT 6`
    );

    // ---- 推荐路线 ----
    const recommendedRoutes = await executeRead<Array<{
      id: number; name: string; theme: string; description?: string | null; estimated_minutes: number;
    }>>(
      `SELECT id, name, theme, description, estimated_minutes
       FROM route WHERE status = 1 ORDER BY created_at DESC LIMIT 3`
    );

    // ---- 商品推荐（MySQL product 表，按点赞热度排序） ----
    const hotProducts = await executeRead<Array<{
      id: number; name: string; description: string | null; price: number;
      image_url: string | null; category: string | null; like_count: number;
      favorite_count: number;
    }>>(
      `SELECT id, name, description, price, image_url, category, like_count, favorite_count
       FROM product WHERE status = 1 ORDER BY like_count DESC, sales DESC LIMIT 6`
    );

    // ---- 运营统计 ----
    const [interactionsStat] = await executeRead<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM interaction_log`
    );
    const [todayStat] = await executeRead<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM interaction_log WHERE DATE(created_at) = CURDATE()`
    );
    const [positiveStat] = await executeRead<Array<{ rate: number | null }>>(
      `SELECT ROUND(
         SUM(CASE WHEN label = 'positive' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
         2
       ) AS rate FROM sentiment_data`
    );
    const [productStat] = await executeRead<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM product WHERE status = 1`
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
          totalProducts: productStat?.total ?? 0,
        },
      },
    });
  } catch (error) {
    log.ERROR(`首页聚合接口异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '首页数据加载失败' });
  }
});

// ======================== GET /products 商品列表（公开） ========================
router.get('/products', async (req: Request, res: Response) => {
  try {
    await initProductTables();
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const sql = category
      ? `SELECT * FROM product WHERE status = 1 AND category = ? ORDER BY like_count DESC, sales DESC LIMIT 50`
      : `SELECT * FROM product WHERE status = 1 ORDER BY like_count DESC, sales DESC LIMIT 50`;
    const params = category ? [category] : [];
    const rows = await executeRead<Array<Record<string, unknown>>>(sql, params);
    res.json({ code: 0, message: 'ok', data: rows });
  } catch (error) {
    log.ERROR(`商品列表异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '商品列表加载失败' });
  }
});

// ======================== GET /products/:id 商品详情（公开） ========================
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    await initProductTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40000, message: 'id 非法' });
      return;
    }
    const [product] = await executeRead<Array<Record<string, unknown>>>(
      `SELECT * FROM product WHERE id = ? LIMIT 1`, [id]
    );
    if (!product) {
      res.status(404).json({ code: 40400, message: '商品不存在' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: product });
  } catch (error) {
    log.ERROR(`商品详情异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '商品详情加载失败' });
  }
});

// ======================== POST /products/:id/like 点赞（持久化 + 去重） ========================
router.post('/products/:id/like', async (req: Request, res: Response) => {
  try {
    await initProductTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40000, message: 'id 非法' });
      return;
    }
    const userId = (req.body?.userId as string) || 'anonymous';

    // 检查是否已点赞
    const [existing] = await executeRead<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM product_like WHERE product_id = ? AND user_id = ? AND action = 'like'`,
      [id, userId]
    );
    const already = (existing?.c ?? 0) > 0;

    if (already) {
      // 取消点赞
      await executeWrite(
        `DELETE FROM product_like WHERE product_id = ? AND user_id = ? AND action = 'like'`,
        [id, userId]
      );
      await executeWrite(`UPDATE product SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?`, [id]);
      const [p] = await executeRead<Array<{ like_count: number }>>(`SELECT like_count FROM product WHERE id = ?`, [id]);
      res.json({ code: 0, message: '已取消点赞', data: { liked: false, likeCount: p?.like_count ?? 0 } });
    } else {
      // 新增点赞
      await executeWrite(
        `INSERT IGNORE INTO product_like (product_id, user_id, action) VALUES (?, ?, 'like')`,
        [id, userId]
      );
      await executeWrite(`UPDATE product SET like_count = like_count + 1 WHERE id = ?`, [id]);
      const [p] = await executeRead<Array<{ like_count: number }>>(`SELECT like_count FROM product WHERE id = ?`, [id]);
      res.json({ code: 0, message: '点赞成功', data: { liked: true, likeCount: p?.like_count ?? 0 } });
    }
  } catch (error) {
    log.ERROR(`商品点赞异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '点赞失败' });
  }
});

// ======================== POST /products/:id/favorite 收藏（持久化 + 去重） ========================
router.post('/products/:id/favorite', async (req: Request, res: Response) => {
  try {
    await initProductTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40000, message: 'id 非法' });
      return;
    }
    const userId = (req.body?.userId as string) || 'anonymous';

    const [existing] = await executeRead<Array<{ c: number }>>(
      `SELECT COUNT(*) AS c FROM product_like WHERE product_id = ? AND user_id = ? AND action = 'favorite'`,
      [id, userId]
    );
    const already = (existing?.c ?? 0) > 0;

    if (already) {
      await executeWrite(
        `DELETE FROM product_like WHERE product_id = ? AND user_id = ? AND action = 'favorite'`,
        [id, userId]
      );
      await executeWrite(`UPDATE product SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = ?`, [id]);
      const [p] = await executeRead<Array<{ favorite_count: number }>>(`SELECT favorite_count FROM product WHERE id = ?`, [id]);
      res.json({ code: 0, message: '已取消收藏', data: { favorited: false, favoriteCount: p?.favorite_count ?? 0 } });
    } else {
      await executeWrite(
        `INSERT IGNORE INTO product_like (product_id, user_id, action) VALUES (?, ?, 'favorite')`,
        [id, userId]
      );
      await executeWrite(`UPDATE product SET favorite_count = favorite_count + 1 WHERE id = ?`, [id]);
      const [p] = await executeRead<Array<{ favorite_count: number }>>(`SELECT favorite_count FROM product WHERE id = ?`, [id]);
      res.json({ code: 0, message: '收藏成功', data: { favorited: true, favoriteCount: p?.favorite_count ?? 0 } });
    }
  } catch (error) {
    log.ERROR(`商品收藏异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '收藏失败' });
  }
});

export default router;
