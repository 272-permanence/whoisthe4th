/**
 * @file 高德路径规划代理接口
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description GET /api/v1/navigation/route：后端代理高德 Web服务 步行/驾车路径规划。
 *              前端只传起止点坐标，Web服务 Key 不出现在浏览器中。
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const log = createLogger('navigation');

/** 支持的出行方式，对应高德 direction 接口路径 */
type TravelMode = 'walking' | 'driving';

/** 高德返回的单个导航步骤 */
interface AmapStep {
  instruction?: string;
  distance?: string;
  duration?: string;
  polyline?: string;
}

/** 高德返回的单条路径 */
interface AmapPath {
  distance?: string;
  duration?: string;
  steps?: AmapStep[];
}

/** 高德 Web服务 路径规划响应（仅声明用到的字段） */
interface AmapDirectionResponse {
  status?: string;
  info?: string;
  infocode?: string;
  route?: { paths?: AmapPath[] };
}

/** 对外返回的路径点 */
export interface NavigationPoint {
  lng: number;
  lat: number;
}

const AMAP_DIRECTION_BASE = 'https://restapi.amap.com/v3/direction';

const router = Router();

/**
 * 解析 "lng,lat" 形式的坐标参数
 * @param value 原始查询参数
 * @param field 参数名，用于错误提示
 * @returns [经度, 纬度]
 */
function parseCoordinate(value: string | undefined, field: string): [number, number] {
  if (!value) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, `缺少参数 ${field}，格式为 lng,lat`);
  }
  const [lngText, latText] = value.split(',');
  const lng = Number(lngText);
  const lat = Number(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, `参数 ${field} 不合法，格式为 lng,lat`);
  }
  return [lng, lat];
}

/**
 * 把高德折线串 "lng,lat;lng,lat;..." 解析成点数组，并去掉相邻重复点
 * @param polyline 高德返回的 polyline
 * @returns 路径点数组
 */
function parsePolyline(polyline: string | undefined): NavigationPoint[] {
  if (!polyline) return [];
  const points: NavigationPoint[] = [];
  for (const pair of polyline.split(';')) {
    const [lngText, latText] = pair.split(',');
    const lng = Number(lngText);
    const lat = Number(latText);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const last = points[points.length - 1];
    if (last && last.lng === lng && last.lat === lat) continue;
    points.push({ lng, lat });
  }
  return points;
}

/** GET /api/v1/navigation/route?origin=lng,lat&destination=lng,lat&mode=walking|driving */
router.get('/route', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modeParam = typeof req.query.mode === 'string' ? req.query.mode : 'walking';
    if (modeParam !== 'walking' && modeParam !== 'driving') {
      throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'mode 仅支持 walking 或 driving');
    }
    const mode: TravelMode = modeParam;

    const origin = parseCoordinate(typeof req.query.origin === 'string' ? req.query.origin : undefined, 'origin');
    const destination = parseCoordinate(
      typeof req.query.destination === 'string' ? req.query.destination : undefined,
      'destination'
    );

    const key = config.amap.webServiceKey;
    if (!key) {
      throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '未配置 AMAP_WEB_SERVICE_KEY，无法规划路径');
    }

    const url = new URL(`${AMAP_DIRECTION_BASE}/${mode}`);
    url.searchParams.set('origin', `${origin[0]},${origin[1]}`);
    url.searchParams.set('destination', `${destination[0]},${destination[1]}`);
    url.searchParams.set('key', key);
    url.searchParams.set('extensions', 'base');

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new HttpError(502, ErrorCodeEnum.INTERNAL_ERROR, `高德路径规划请求失败：HTTP ${response.status}`);
    }

    const payload = (await response.json()) as AmapDirectionResponse;
    if (payload.status !== '1') {
      log.WARN(`高德返回异常: ${payload.info ?? 'unknown'} (${payload.infocode ?? '-'})`);
      throw new HttpError(502, ErrorCodeEnum.INTERNAL_ERROR, `高德路径规划失败：${payload.info ?? '未知错误'}`);
    }

    const path = payload.route?.paths?.[0];
    if (!path) {
      throw new HttpError(502, ErrorCodeEnum.INTERNAL_ERROR, '未查询到可用路径，请更换起止点');
    }

    const data = {
      mode,
      origin: { lng: origin[0], lat: origin[1] },
      destination: { lng: destination[0], lat: destination[1] },
      /** 总距离，单位米 */
      distance: Number(path.distance ?? 0),
      /** 预计耗时，单位秒 */
      duration: Number(path.duration ?? 0),
      polyline: parsePolyline(path.steps?.map((step) => step.polyline ?? '').join(';')),
      steps: (path.steps ?? []).map((step) => ({
        instruction: step.instruction ?? '',
        distance: Number(step.distance ?? 0),
        duration: Number(step.duration ?? 0)
      }))
    };

    res.json({ code: 0, message: '规划成功', data });
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    log.ERROR(`路径规划异常: ${error instanceof Error ? error.message : error}`);
    next(new HttpError(502, ErrorCodeEnum.INTERNAL_ERROR, '路径规划服务暂时不可用'));
  }
});

export default router;
