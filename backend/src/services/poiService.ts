/**
 * @file 景点与游览路线查询服务
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description 封装 poi / route / route_poi 三张表的只读查询。
 *              仅返回 status = 1 的数据，写操作由管理端（成员D）负责。
 */
import { getDbPool } from '../utils/db.js';
import { createLogger } from '../common/logger.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const log = createLogger('poi-service');

/** 单次列表查询的默认与最大条数 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** POI 类型，与 poi.category 枚举保持一致 */
export type PoiCategory = 'attraction' | 'facility' | 'landmark' | 'food' | 'other';

/** 对外返回的景点结构 */
export interface PoiItem {
  id: number;
  name: string;
  category: PoiCategory;
  description: string | null;
  location: string | null;
  longitude: number | null;
  latitude: number | null;
}

/** 路线中的一个途经点 */
export interface RouteStop {
  poiId: number;
  name: string;
  category: PoiCategory;
  seq: number;
  stayMinutes: number;
  longitude: number | null;
  latitude: number | null;
}

/** 对外返回的路线结构 */
export interface RouteItem {
  id: number;
  name: string;
  theme: string;
  description: string | null;
  estimatedMinutes: number;
  stops: RouteStop[];
}

/** poi 表原始行 */
interface PoiRow {
  id: number;
  name: string;
  category: PoiCategory;
  description: string | null;
  location: string | null;
  longitude: string | number | null;
  latitude: string | number | null;
}

/** route + route_poi + poi 联查原始行 */
interface RouteJoinRow {
  id: number;
  name: string;
  theme: string;
  description: string | null;
  estimated_minutes: number;
  poi_id: number | null;
  poi_name: string | null;
  poi_category: PoiCategory | null;
  seq: number | null;
  stay_minutes: number | null;
  longitude: string | number | null;
  latitude: string | number | null;
}

/** DECIMAL 字段在 mysql2 中默认返回字符串，统一转数字 */
function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 原始行 → 对外结构 */
function mapPoi(row: PoiRow): PoiItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    location: row.location,
    longitude: toNumber(row.longitude),
    latitude: toNumber(row.latitude)
  };
}

/**
 * 把联查结果按 route.id 聚合成路线 + 途经点列表
 * @param rows route / route_poi / poi 联查得到的平铺行
 * @returns 路线数组，stops 已按 seq 升序
 */
function groupRoutes(rows: RouteJoinRow[]): RouteItem[] {
  const map = new Map<number, RouteItem>();
  for (const row of rows) {
    let route = map.get(row.id);
    if (!route) {
      route = {
        id: row.id,
        name: row.name,
        theme: row.theme,
        description: row.description,
        estimatedMinutes: row.estimated_minutes,
        stops: []
      };
      map.set(row.id, route);
    }
    // LEFT JOIN 时没有途经点的路线会有一行 poi_id = null
    if (row.poi_id !== null && row.poi_name !== null) {
      route.stops.push({
        poiId: row.poi_id,
        name: row.poi_name,
        category: row.poi_category ?? 'other',
        seq: row.seq ?? 0,
        stayMinutes: row.stay_minutes ?? 0,
        longitude: toNumber(row.longitude),
        latitude: toNumber(row.latitude)
      });
    }
  }
  for (const route of map.values()) {
    route.stops.sort((a, b) => a.seq - b.seq);
  }
  return [...map.values()];
}

/**
 * 查询景点列表
 * @param params category 类型筛选、keyword 名称/简介模糊搜索、limit 条数上限
 * @returns 启用中的景点列表
 */
export async function listPois(params: {
  category?: string;
  keyword?: string;
  limit?: number;
} = {}): Promise<PoiItem[]> {
  const conditions = ['status = 1'];
  const args: Array<string | number> = [];

  if (params.category) {
    conditions.push('category = ?');
    args.push(params.category);
  }
  if (params.keyword) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    args.push(`%${params.keyword}%`, `%${params.keyword}%`);
  }

  const rawLimit = Number(params.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      `SELECT id, name, category, description, location, longitude, latitude
       FROM poi WHERE ${conditions.join(' AND ')}
       ORDER BY id ASC LIMIT ${limit}`,
      args
    );
    return (rows as PoiRow[]).map(mapPoi);
  } catch (err) {
    log.ERROR(`景点列表查询失败: ${err instanceof Error ? err.message : err}`);
    throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '景点数据查询失败，请检查数据库连接');
  }
}

/**
 * 按 ID 查询单个景点
 * @param id 景点 ID
 * @returns 景点详情
 * @throws 景点不存在时抛出 404
 */
export async function getPoiById(id: number): Promise<PoiItem> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      `SELECT id, name, category, description, location, longitude, latitude
       FROM poi WHERE id = ? AND status = 1`,
      [id]
    );
    const row = (rows as PoiRow[])[0];
    if (!row) {
      throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM, '景点不存在或已下架');
    }
    return mapPoi(row);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    log.ERROR(`景点详情查询失败: ${err instanceof Error ? err.message : err}`);
    throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '景点数据查询失败，请检查数据库连接');
  }
}

/**
 * 查询游览路线列表（含按顺序排列的途经点）
 * @param theme 可选的主题筛选：history / nature / family / general
 * @returns 路线列表
 */
export async function listRoutes(theme?: string): Promise<RouteItem[]> {
  const themeCondition = theme ? ' AND r.theme = ?' : '';
  const args: Array<string | number> = theme ? [theme] : [];

  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      `SELECT r.id, r.name, r.theme, r.description, r.estimated_minutes,
              rp.poi_id, rp.seq, rp.stay_minutes,
              p.name AS poi_name, p.category AS poi_category, p.longitude, p.latitude
       FROM route r
       LEFT JOIN route_poi rp ON rp.route_id = r.id
       LEFT JOIN poi p ON p.id = rp.poi_id AND p.status = 1
       WHERE r.status = 1${themeCondition}
       ORDER BY r.id ASC, rp.seq ASC`,
      args
    );
    return groupRoutes(rows as RouteJoinRow[]);
  } catch (err) {
    log.ERROR(`路线列表查询失败: ${err instanceof Error ? err.message : err}`);
    throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '路线数据查询失败，请检查数据库连接');
  }
}

/**
 * 按 ID 查询单条路线
 * @param id 路线 ID
 * @returns 路线详情
 * @throws 路线不存在时抛出 404
 */
export async function getRouteById(id: number): Promise<RouteItem> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      `SELECT r.id, r.name, r.theme, r.description, r.estimated_minutes,
              rp.poi_id, rp.seq, rp.stay_minutes,
              p.name AS poi_name, p.category AS poi_category, p.longitude, p.latitude
       FROM route r
       LEFT JOIN route_poi rp ON rp.route_id = r.id
       LEFT JOIN poi p ON p.id = rp.poi_id AND p.status = 1
       WHERE r.id = ? AND r.status = 1
       ORDER BY rp.seq ASC`,
      [id]
    );
    const routes = groupRoutes(rows as RouteJoinRow[]);
    const route = routes[0];
    if (!route) {
      throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM, '路线不存在或已下架');
    }
    return route;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    log.ERROR(`路线详情查询失败: ${err instanceof Error ? err.message : err}`);
    throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '路线数据查询失败，请检查数据库连接');
  }
}
