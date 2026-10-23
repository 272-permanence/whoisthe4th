/**
 * @file 景区路线推荐服务
 * @author 第八组（成员B）
 * @date 2026-10-23
 * @description 查询 poi / route / route_poi 表，为路线类问题组装上下文供 LLM 使用。
 *              MySQL 不可用时返回空上下文，chat 路由降级为纯 LLM 回答。
 */

import { getDbPool } from '../utils/db.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('route-service');

/** 路线类问题关键词（命中任一即视为路线咨询） */
const ROUTE_KEYWORDS = [
  '路线', '游览路线', '推荐路线', '行程', '怎么逛', '怎么走',
  '逛多久', '玩多久', '游览顺序', '精华', '必去', '打卡',
  '一日游', '半日游', '线路', '攻略', '怎么走比较好'
];

/** POI 行 */
interface PoiRow {
  id: number;
  name: string;
  category: string;
  description: string | null;
  location: string | null;
  stay_minutes: number;
}

/** 路线行 */
interface RouteRow {
  id: number;
  name: string;
  theme: string;
  description: string | null;
  estimated_minutes: number;
  pois: PoiRow[];
}

/**
 * 判断用户问题是否属于路线咨询
 * @param question 用户问题文本
 * @returns 是否命中路线关键词
 */
export function isRouteQuestion(question: string): boolean {
  if (!question) return false;
  return ROUTE_KEYWORDS.some(kw => question.includes(kw));
}

/**
 * 从数据库加载所有启用的路线及其 POI 顺序
 * @returns 路线列表（MySQL 不可用时返回空数组）
 */
export async function loadAllRoutes(): Promise<RouteRow[]> {
  try {
    const pool = getDbPool();

    // 1. 查询所有启用的路线
    const [routeRows] = await pool.execute(
      'SELECT id, name, theme, description, estimated_minutes FROM route WHERE status = 1 ORDER BY id ASC'
    );
    const routes = routeRows as RouteRow[];
    if (routes.length === 0) return [];

    // 2. 批量查询路线关联的 POI（按 seq 排序）
    const [rpRows] = await pool.execute(
      `SELECT rp.route_id, rp.seq, rp.stay_minutes,
              p.id, p.name, p.category, p.description, p.location
       FROM route_poi rp
       JOIN poi p ON p.id = rp.poi_id
       WHERE p.status = 1
       ORDER BY rp.route_id ASC, rp.seq ASC`
    );

    // 3. 按 route_id 分组
    const poiMap = new Map<number, PoiRow[]>();
    for (const row of rpRows as Array<{
      route_id: number; seq: number; stay_minutes: number;
      id: number; name: string; category: string;
      description: string | null; location: string | null;
    }>) {
      const poi: PoiRow = {
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        location: row.location,
        stay_minutes: row.stay_minutes,
      };
      if (!poiMap.has(row.route_id)) poiMap.set(row.route_id, []);
      poiMap.get(row.route_id)!.push(poi);
    }

    for (const route of routes) {
      route.pois = poiMap.get(route.id) ?? [];
    }

    log.INFO(`加载路线 ${routes.length} 条`);
    return routes;
  } catch (err) {
    log.WARN(`路线数据加载失败（可能 MySQL 未配置）: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/**
 * 将路线数据组装为 LLM 可用的文本上下文
 * @param routes 路线列表
 * @returns 格式化的路线上下文文本（无数据时返回空字符串）
 */
export function buildRouteContext(routes: RouteRow[]): string {
  if (routes.length === 0) return '';

  const lines = ['以下是景区当前可推荐的游览路线，请基于这些信息回答用户的路线咨询：'];
  for (const route of routes) {
    lines.push('');
    lines.push(`【路线】${route.name}（主题：${route.theme}，预计游览 ${route.estimated_minutes} 分钟）`);
    if (route.description) lines.push(`简介：${route.description}`);
    if (route.pois.length > 0) {
      lines.push('途经景点（按顺序）：');
      route.pois.forEach((p, i) => {
        const stay = p.stay_minutes > 0 ? `，建议停留 ${p.stay_minutes} 分钟` : '';
        const desc = p.description ? ` —— ${p.description}` : '';
        lines.push(`  ${i + 1}. ${p.name}${stay}${desc}`);
      });
    }
  }
  lines.push('\n请根据用户需求（如时间、兴趣偏好）推荐最合适的路线，并自然地介绍各景点亮点。');
  return lines.join('\n');
}

/**
 * 一站式获取路线上下文（检测 + 查询 + 组装）
 * @param question 用户问题
 * @returns 若为路线问题则返回上下文文本，否则返回空字符串
 */
export async function getRouteContextIfNeeded(question: string): Promise<string> {
  if (!isRouteQuestion(question)) return '';
  const routes = await loadAllRoutes();
  return buildRouteContext(routes);
}
