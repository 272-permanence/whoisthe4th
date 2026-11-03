/**
 * @file 首页聚合接口（成员D）
 * @author 第八组（成员D）
 * @date 2026-11-03（重构：Banner/快捷入口从 digital_human_config 键值对表读）
 * @description
 *   一次请求返回移动端首页所有模块。
 *   所有可配置内容存 digital_human_config（键值对 JSON），后台改 JSON 即可实时生效。
 *   管理员可通过 ContentAdmin 页面或直接改 DB 维护。
 *
 *   数据源：
 *     - banners / quickEntries：digital_human_config 表（config_key = 'home_banners' / 'home_quick_entries'）
 *     - hotPois              ：poi 表，status=1 限 6
 *     - recommendedRoutes    ：route 表，status=1 限 3
 *     - stats                ：聚合 interaction_log + sentiment_data
 *     - hotProducts          ：成员C商品表落地后再接（当前空数组）
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../common/logger.js';
import { executeRead } from '../analytics/db.js';

const log = createLogger('home');
const router = Router();

// ======================== 兜底默认值（DB 无配置时用） ========================

const DEFAULT_BANNERS = [
  { id: 1, title: '欢迎来到西湖景区 AI 导览', image: '', color: 'linear-gradient(135deg, #1989fa, #4db8ff)' },
  { id: 2, title: '智慧导览 · 沉浸式体验', image: '', color: 'linear-gradient(135deg, #07c160, #65d67c)' },
  { id: 3, title: '语音交互 · 数字人陪伴', image: '', color: 'linear-gradient(135deg, #ff976a, #ffc77a)' },
];

const DEFAULT_QUICK_ENTRIES = [
  { icon: 'service-o', label: 'AI 导览', path: '/interaction', color: '#1989fa' },
  { icon: 'location-o', label: '景色推荐', path: '/poi', color: '#07c160' },
  { icon: 'guide-o', label: '游玩攻略', path: '/routes', color: '#ff976a' },
  { icon: 'goods-o', label: '失物招领', path: '/lost-found', color: '#7232dd' },
];

/**
 * 从 digital_human_config 表读 JSON 配置
 * 找不到或 JSON 非法 → 返回 fallback
 */
async function readJsonConfig<T>(key: string, fallback: T): Promise<T> {
  const [row] = await executeRead<Array<{ config_value: string | null }>>(
    `SELECT config_value FROM digital_human_config WHERE config_key = ? LIMIT 1`,
    [key]
  );
  if (!row?.config_value) return fallback;
  try {
    return JSON.parse(row.config_value) as T;
  } catch {
    log.WARN(`config key=${key} JSON 解析失败，使用默认值`);
    return fallback;
  }
}

// ======================== GET / 首页聚合 ========================

router.get('/', async (_req: Request, res: Response) => {
  try {
    // ---- 可配置模块：从 DB 读，失败用兜底值 ----
    const banners = await readJsonConfig('home_banners', DEFAULT_BANNERS);
    const quickEntries = await readJsonConfig('home_quick_entries', DEFAULT_QUICK_ENTRIES);

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

    res.json({
      code: 0,
      message: 'ok',
      data: {
        banners,
        quickEntries,
        hotPois,
        recommendedRoutes,
        hotProducts: [], // TODO 成员C商品表
        stats: {
          totalInteractions: interactionsStat?.total ?? 0,
          todayInteractions: todayStat?.total ?? 0,
          positiveRate: positiveStat?.rate ?? 0,
        },
      },
    });
  } catch (error) {
    log.ERROR(`首页聚合接口异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '首页数据加载失败' });
  }
});

export default router;
