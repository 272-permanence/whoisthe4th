/**
 * @file 商品路由：/api/v1/products（GET 公开，写操作需 admin）
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { Router, type Request, type Response } from 'express';
import { getAuthDb } from '../services/authDb.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

interface ProductRow {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/v1/products - 列表 */
router.get('/', (_req, res) => {
  const db = getAuthDb();
  const rows = db.prepare('SELECT * FROM product ORDER BY id DESC').all() as ProductRow[];
  res.json({ code: 0, message: 'ok', data: rows });
});

/** GET /api/v1/products/:id - 详情 */
router.get('/:id', (req, res) => {
  const db = getAuthDb();
  const row = db.prepare('SELECT * FROM product WHERE id = ?').get(req.params.id) as ProductRow | undefined;
  if (!row) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '商品不存在');
  res.json({ code: 0, message: 'ok', data: row });
});

/** POST /api/v1/products - 新建（需 admin） */
router.post('/', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  const { name, description, price, stock, category, image_url } = req.body ?? {};
  if (!name) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'name 必填');
  const db = getAuthDb();
  const result = db
    .prepare(
      `INSERT INTO product (name, description, price, stock, category, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(name),
      description ? String(description) : null,
      Number(price ?? 0),
      Number(stock ?? 0),
      category ? String(category) : null,
      image_url ? String(image_url) : null
    );
  const row = db.prepare('SELECT * FROM product WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ code: 0, message: 'ok', data: row });
});

/** PUT /api/v1/products/:id - 更新（需 admin） */
router.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM product WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '商品不存在');

  const { name, description, price, stock, category, image_url } = req.body ?? {};
  db.prepare(
    `UPDATE product SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       price = COALESCE(?, price),
       stock = COALESCE(?, stock),
       category = COALESCE(?, category),
       image_url = COALESCE(?, image_url),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    name ? String(name) : null,
    description !== undefined ? String(description) : null,
    price !== undefined ? Number(price) : null,
    stock !== undefined ? Number(stock) : null,
    category !== undefined ? String(category) : null,
    image_url !== undefined ? String(image_url) : null,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM product WHERE id = ?').get(req.params.id);
  res.json({ code: 0, message: 'ok', data: row });
});

/** DELETE /api/v1/products/:id - 删除（需 admin） */
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getAuthDb();
  const result = db.prepare('DELETE FROM product WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '商品不存在');
  res.json({ code: 0, message: 'ok', data: null });
});

export default router;
