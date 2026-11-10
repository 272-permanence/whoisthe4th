/**
 * @file 景点 POI CRUD（成员D 代补）
 * @author 第八组（成员D）
 * @date 2026-11-03
 * @description
 *   GET    /api/v1/poi              列表（管理员带禁用项，默认只看 status=1）
 *   GET    /api/v1/poi/:id          详情
 *   POST   /api/v1/poi              新增
 *   PUT    /api/v1/poi/:id          修改
 *   DELETE /api/v1/poi/:id          软删除（status=0）
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../common/logger.js';
import { executeRead, executeWrite } from '../analytics/db.js';

type SqlParam = string | number | boolean | Date | null;

const log = createLogger('poi');
const router = Router();

const VALID_CATEGORIES = ['attraction', 'facility', 'landmark', 'food', 'other'];

interface PoiInput {
  name: string;
  category?: string;
  description?: string;
  location?: string;
  longitude?: number | null;
  latitude?: number | null;
  status?: 0 | 1;
}

// ======================== GET / 列表 ========================

router.get('/', async (req: Request, res: Response) => {
  try {
    const showAll = req.query.all === '1';
    const category = (req.query.category as string)?.trim();

    const rows = await executeRead<Array<{
      id: number; name: string; category: string; description: string | null;
      location: string | null; status: number;
    }>>(
      `SELECT id, name, category, description, location, status
       FROM poi
       WHERE ${showAll ? '1=1' : 'status = 1'}
             ${category ? 'AND category = ?' : ''}
       ORDER BY status DESC, created_at DESC
       LIMIT 200`,
      category ? [category] : []
    );
    res.json({ code: 0, message: 'ok', data: rows });
  } catch (error) {
    log.ERROR(`POI 列表异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: 'POI 列表加载失败' });
  }
});

// ======================== GET /:id 详情 ========================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: 'POI ID 无效' });
      return;
    }
    const [row] = await executeRead<Array<Record<string, unknown>>>(
      `SELECT * FROM poi WHERE id = ?`, [id]
    );
    if (!row) {
      res.status(404).json({ code: 40401, message: 'POI 不存在' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: row });
  } catch (error) {
    log.ERROR(`POI 详情异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: 'POI 详情加载失败' });
  }
});

// ======================== POST / 新增 ========================

router.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as PoiInput;
    if (!input.name?.trim()) {
      res.status(400).json({ code: 40001, message: 'POI 名称必填' });
      return;
    }
    const category = input.category && VALID_CATEGORIES.includes(input.category) ? input.category : 'attraction';

    const result = await executeWrite<{ insertId: number }>(
      `INSERT INTO poi (name, category, description, location, longitude, latitude, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(), category,
        input.description ?? null, input.location ?? null,
        input.longitude ?? null, input.latitude ?? null,
        input.status ?? 1,
      ]
    );
    res.json({ code: 0, message: 'ok', data: { id: result.insertId } });
  } catch (error) {
    log.ERROR(`POI 新增异常: ${String(error)}`);
    res.status(500).json({ code: 50000, message: 'POI 新增失败' });
  }
});

// ======================== PUT /:id 修改 ========================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: 'POI ID 无效' });
      return;
    }
    const input = req.body as Partial<PoiInput>;
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name.trim()); }
    if (input.category !== undefined && VALID_CATEGORIES.includes(input.category)) { sets.push('category = ?'); params.push(input.category); }
    if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description); }
    if (input.location !== undefined) { sets.push('location = ?'); params.push(input.location); }
    if (input.longitude !== undefined) { sets.push('longitude = ?'); params.push(input.longitude); }
    if (input.latitude !== undefined) { sets.push('latitude = ?'); params.push(input.latitude); }
    if (input.status !== undefined) {
      if (input.status !== 0 && input.status !== 1) {
        res.status(400).json({ code: 40001, message: 'status 必须是 0 或 1' });
        return;
      }
      sets.push('status = ?'); params.push(input.status);
    }
    if (sets.length === 0) {
      res.json({ code: 0, message: 'ok', data: { id } });
      return;
    }

    params.push(id);
    await executeWrite(`UPDATE poi SET ${sets.join(', ')} WHERE id = ?`, params as SqlParam[]);
    res.json({ code: 0, message: 'ok', data: { id } });
  } catch (error) {
    log.ERROR(`POI 修改异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: 'POI 修改失败' });
  }
});

// ======================== DELETE /:id 软删除 ========================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 40001, message: 'POI ID 无效' });
      return;
    }
    await executeWrite(`UPDATE poi SET status = 0 WHERE id = ?`, [id]);
    res.json({ code: 0, message: 'ok' });
  } catch (error) {
    log.ERROR(`POI 删除异常 id=${req.params.id}: ${String(error)}`);
    res.status(500).json({ code: 50000, message: 'POI 删除失败' });
  }
});

export default router;
