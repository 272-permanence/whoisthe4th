/**
 * @file 游玩攻略 · 路线 CRUD（成员D 代补）
 * @author 第八组（成员D）
 * @date 2026-11-03（加全量 CRUD + soft delete + route_poi 关联管理）
 * @description
 *   GET    /api/v1/routes              列表（管理员带禁用项，用户端只看 status=1）
 *   GET    /api/v1/routes/:id          详情 + 途经 POI 链
 *   POST   /api/v1/routes              新增
 *   PUT    /api/v1/routes/:id          修改（支持 status 切换做上下架）
 *   DELETE /api/v1/routes/:id          软删除（status=0）
 *   PUT    /api/v1/routes/:id/steps    整体替换途经 POI 链（全量覆盖 route_poi）
 *
 *   注意：当前接口不校验 JWT（等成员C的 auth 中间件落地后挂上去）。
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../common/logger.js';
import { executeRead, executeWrite } from '../analytics/db.js';

type SqlParam = string | number | boolean | Date | null;

const log = createLogger('guide');
const router = Router();

// ======================== 类型 ========================

type RouteStatus = 0 | 1;
const VALID_THEMES = ['history', 'nature', 'family', 'food', 'general'];

interface RouteSummary {
  id: number;
  name: string;
  theme: string;
  description: string | null;
  estimated_minutes: number;
  status: RouteStatus;
  poi_count: number;
}

interface PoiStep {
  poi_id: number;
  seq: number;
  stay_minutes: number;
  name: string;
  category: string;
  description: string | null;
  location: string | null;
}

interface RouteDetail extends RouteSummary {
  steps: PoiStep[];
}

interface StepInput {
  poi_id: number;
  stay_minutes?: number;
}

interface RouteInput {
  name: string;
  theme?: string;
  description?: string;
  estimated_minutes?: number;
  status?: RouteStatus;
}

// ======================== GET / 列表 ========================

router.get('/', async (req: Request, res: Response) => {
  try {
    const theme = (req.query.theme as string)?.trim();
    // 管理员可传 ?all=1 看全部（含禁用），默认只返回启用的
    const showAll = req.query.all === '1';

    const routes = await executeRead<RouteSummary[]>(
      `SELECT r.id, r.name, r.theme, r.description, r.estimated_minutes, r.status,
              COUNT(rp.id) AS poi_count
       FROM route r
       LEFT JOIN route_poi rp ON rp.route_id = r.id
       WHERE ${showAll ? '1=1' : 'r.status = 1'}
             ${theme ? 'AND r.theme = ?' : ''}
       GROUP BY r.id
       ORDER BY r.status DESC, r.created_at DESC
       LIMIT 200`,
      theme ? [theme] : []
    );

    res.json({ code: 0, message: 'ok', data: routes });
  } catch (error) {
    log.ERROR(`路线列表异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线列表加载失败' });
  }
});

// ======================== GET /:id 详情 ========================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: '路线 ID 无效' });
      return;
    }

    const [row] = await executeRead<RouteSummary[]>(
      `SELECT r.id, r.name, r.theme, r.description, r.estimated_minutes, r.status,
              COUNT(rp.id) AS poi_count
       FROM route r
       LEFT JOIN route_poi rp ON rp.route_id = r.id
       WHERE r.id = ? GROUP BY r.id`,
      [id]
    );
    if (!row) {
      res.status(404).json({ code: 40401, message: '路线不存在' });
      return;
    }

    const steps = await executeRead<PoiStep[]>(
      `SELECT rp.poi_id, rp.seq, rp.stay_minutes,
              p.name, p.category, p.description, p.location
       FROM route_poi rp JOIN poi p ON p.id = rp.poi_id
       WHERE rp.route_id = ? ORDER BY rp.seq ASC`,
      [id]
    );

    res.json({ code: 0, message: 'ok', data: { ...row, steps } });
  } catch (error) {
    log.ERROR(`路线详情异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线详情加载失败' });
  }
});

// ======================== POST / 新增 ========================

router.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as RouteInput;
    if (!input.name?.trim()) {
      res.status(400).json({ code: 40001, message: '路线名称必填' });
      return;
    }
    const theme = input.theme && VALID_THEMES.includes(input.theme) ? input.theme : 'general';

    const result = await executeWrite<{ insertId: number }>(
      `INSERT INTO route (name, theme, description, estimated_minutes, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        theme,
        input.description ?? null,
        input.estimated_minutes ?? 0,
        input.status ?? 1,
      ]
    );

    res.json({ code: 0, message: 'ok', data: { id: result.insertId } });
  } catch (error) {
    log.ERROR(`路线新增异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线新增失败' });
  }
});

// ======================== PUT /:id 修改 ========================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: '路线 ID 无效' });
      return;
    }
    const input = req.body as Partial<RouteInput>;

    // 先查存不存在
    const [exists] = await executeRead<Array<{ id: number }>>(
      `SELECT id FROM route WHERE id = ?`, [id]
    );
    if (!exists) {
      res.status(404).json({ code: 40401, message: '路线不存在' });
      return;
    }

    // 动态构建 SET 子句
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name.trim()); }
    if (input.theme !== undefined && VALID_THEMES.includes(input.theme)) { sets.push('theme = ?'); params.push(input.theme); }
    if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description); }
    if (input.estimated_minutes !== undefined) { sets.push('estimated_minutes = ?'); params.push(input.estimated_minutes); }
    if (input.status !== undefined) {
      if (input.status !== 0 && input.status !== 1) {
        res.status(400).json({ code: 40001, message: 'status 必须是 0 或 1' });
        return;
      }
      sets.push('status = ?');
      params.push(input.status);
    }

    if (sets.length === 0) {
      res.json({ code: 0, message: 'ok', data: { id } });
      return;
    }

    params.push(id);
    await executeWrite(`UPDATE route SET ${sets.join(', ')} WHERE id = ?`, params as SqlParam[]);
    res.json({ code: 0, message: 'ok', data: { id } });
  } catch (error) {
    log.ERROR(`路线修改异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线修改失败' });
  }
});

// ======================== DELETE /:id 软删除 ========================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: '路线 ID 无效' });
      return;
    }
    await executeWrite(`UPDATE route SET status = 0 WHERE id = ?`, [id]);
    res.json({ code: 0, message: 'ok' });
  } catch (error) {
    log.ERROR(`路线删除异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线删除失败' });
  }
});

// ======================== PUT /:id/steps 整体替换步骤 ========================
// 请求体：{ steps: [{ poi_id: 1, stay_minutes: 15 }, ...] }
// 先清旧的 route_poi，再全量插入新的

router.put('/:id/steps', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: '路线 ID 无效' });
      return;
    }
    const steps = (req.body as { steps?: StepInput[] }).steps;
    if (!Array.isArray(steps)) {
      res.status(400).json({ code: 40001, message: 'steps 必须是数组' });
      return;
    }

    await executeWrite(`DELETE FROM route_poi WHERE route_id = ?`, [id]);

    // 逐条插入（route_poi 的 uk_route_poi_route_poi 保证同一条路线不重复 POI）
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.poi_id || s.poi_id <= 0) continue;
      await executeWrite(
        `INSERT INTO route_poi (route_id, poi_id, seq, stay_minutes) VALUES (?, ?, ?, ?)`,
        [id, s.poi_id, i + 1, s.stay_minutes ?? 0]
      );
    }

    res.json({ code: 0, message: 'ok', data: { count: steps.length } });
  } catch (error) {
    log.ERROR(`路线步骤更新异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: '路线步骤更新失败' });
  }
});

export default router;
