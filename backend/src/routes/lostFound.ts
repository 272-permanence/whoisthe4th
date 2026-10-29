/**
 * @file 失物招领 CRUD 路由（成员D）
 * @author 第八组（成员D）
 * @date 2026-10-27
 * @description 列表（多条件筛选）、详情、创建、更新、改状态、删除
 */

import { Router, type Request, type Response } from 'express';
import mysql from 'mysql2/promise';
import { ErrorCodeEnum } from '../common/errorCodes.js';
import { createLogger } from '../common/logger.js';
import { executeSql, executeWrite } from '../lostFound/db.js';

const log = createLogger('lostfound');
const router = Router();
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// ======================== 类型声明 ========================

export interface LostFoundInput {
  type: 'lost' | 'found';
  category?: string;
  title: string;
  description?: string;
  location?: string;
  image_url?: string;
  contact?: string;
  publisher_name?: string;
  user_id?: string;
}

// ======================== POST / 创建 ========================

router.post('/', async (req: Request, res: Response) => {
  const input = req.body as LostFoundInput;

  // 基础校验
  if (!input.title || !input.title.trim()) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: '标题不能为空' });
    return;
  }
  if (!input.type || !['lost', 'found'].includes(input.type)) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'type 必须为 lost 或 found' });
    return;
  }

  try {
    const result = await executeWrite<{ insertId: number }>(
      `INSERT INTO lost_found
        (type, category, title, description, location, image_url, contact, publisher_name, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.type,
        input.category || 'other',
        input.title.trim(),
        input.description ?? null,
        input.location ?? null,
        input.image_url ?? null,
        input.contact ?? null,
        input.publisher_name ?? null,
        input.user_id ?? null,
      ]
    );

    const rows = await executeSql<mysql.RowDataPacket[]>(
      'SELECT * FROM lost_found WHERE id = ?',
      [result.insertId]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: rows[0],
    });
  } catch (error) {
    log.ERROR(`创建失物招领失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

// ======================== GET / 列表（多条件筛选） ========================

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, category, status, keyword, page, size } = req.query as {
      type?: string; category?: string; status?: string; keyword?: string;
      page?: string; size?: string;
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(size) || DEFAULT_PAGE_SIZE));

    // 动态拼 WHERE
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (type && ['lost', 'found'].includes(type)) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (category && category !== '') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (status && ['open', 'resolved', 'expired'].includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (keyword && keyword.trim()) {
      conditions.push('(title LIKE ? OR description LIKE ? OR location LIKE ?)');
      const kw = `%${keyword.trim()}%`;
      params.push(kw, kw, kw);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (pageNum - 1) * pageSize;

    // 1) 总数
    const [countRow] = await executeSql<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM lost_found ${whereSql}`,
      params
    );
    const total = Number((countRow as mysql.RowDataPacket).total);

    // 2) 分页数据
    const rows = await executeSql<mysql.RowDataPacket[]>(
      `SELECT * FROM lost_found ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        list: rows,
        pagination: { page: pageNum, size: pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    log.ERROR(`查询失物招领列表失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

// ======================== GET /:id 详情 ========================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || id < 1) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
      return;
    }
    const rows = await executeSql<mysql.RowDataPacket[]>(
      'SELECT * FROM lost_found WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      res.status(404).json({ code: ErrorCodeEnum.NOT_FOUND, message: '记录不存在' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: rows[0] });
  } catch (error) {
    log.ERROR(`查询失物招领详情失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

// ======================== PUT /:id 更新 ========================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || id < 1) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
      return;
    }

    // 先查是否存在
    const [exists] = await executeSql<mysql.RowDataPacket[]>(
      'SELECT id FROM lost_found WHERE id = ?',
      [id]
    );
    if (!exists) {
      res.status(404).json({ code: ErrorCodeEnum.NOT_FOUND, message: '记录不存在' });
      return;
    }

    const input = req.body as Partial<LostFoundInput>;
    const fields: string[] = [];
    const params: unknown[] = [];

    const allowedFields: Record<string, (v: unknown) => boolean> = {
      type: (v) => ['lost', 'found'].includes(String(v)),
      category: () => true,
      title: (v) => typeof v === 'string' && v.trim() !== '',
      description: () => true,
      location: () => true,
      image_url: () => true,
      contact: () => true,
      publisher_name: () => true,
    };

    for (const [field, validator] of Object.entries(allowedFields)) {
      if (input[field as keyof LostFoundInput] !== undefined && validator(input[field as keyof LostFoundInput])) {
        fields.push(`${field} = ?`);
        params.push(input[field as keyof LostFoundInput]);
      }
    }

    if (fields.length === 0) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: '没有可更新的字段' });
      return;
    }

    params.push(id);
    await executeWrite(
      `UPDATE lost_found SET ${fields.join(', ')} WHERE id = ?`,
      params as (string | number | boolean | null | Date)[]
    );

    const [updated] = await executeSql<mysql.RowDataPacket[]>(
      'SELECT * FROM lost_found WHERE id = ?',
      [id]
    );
    res.json({ code: 0, message: 'ok', data: updated });
  } catch (error) {
    log.ERROR(`更新失物招领失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

// ======================== PATCH /:id/status 改状态 ========================

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!id || !['open', 'resolved', 'expired'].includes(String(status))) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: '参数非法' });
      return;
    }
    const result = await executeWrite<{ affectedRows: number }>(
      'UPDATE lost_found SET status = ? WHERE id = ?',
      [status, id]
    );
    if (!result.affectedRows) {
      res.status(404).json({ code: ErrorCodeEnum.NOT_FOUND, message: '记录不存在' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: { id, status } });
  } catch (error) {
    log.ERROR(`更新状态失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

// ======================== DELETE /:id 删除 ========================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || id < 1) {
      res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
      return;
    }
    const result = await executeWrite<{ affectedRows: number }>(
      'DELETE FROM lost_found WHERE id = ?',
      [id]
    );
    if (!result.affectedRows) {
      res.status(404).json({ code: ErrorCodeEnum.NOT_FOUND, message: '记录不存在' });
      return;
    }
    res.json({ code: 0, message: 'ok', data: { id } });
  } catch (error) {
    log.ERROR(`删除失物招领失败: ${String(error)}`);
    res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
  }
});

export default router;
