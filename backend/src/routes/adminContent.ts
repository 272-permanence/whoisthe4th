/**
 * @file CMS 内容管理路由（admin 专属，挂在 /api/v1/admin/content）
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { Router, type Request, type Response } from 'express';
import { getAuthDb, type ContentType } from '../services/authDb.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

interface ContentRow {
  id: number; type: string; title: string; subtitle: string | null;
  content: string | null; image_url: string | null; extra_json: string | null;
  sort_order: number; published: number; created_at: string; updated_at: string;
}

const TYPES: ContentType[] = ['carousel', 'scenic', 'route', 'announcement', 'about'];

/** GET / - 全量列表（含未发布，可按 type 过滤） */
router.get('/', (req, res) => {
  const type = req.query.type as string | undefined;
  const db = getAuthDb();
  const rows = type && TYPES.includes(type as ContentType)
    ? db.prepare('SELECT * FROM content WHERE type = ? ORDER BY published DESC, sort_order ASC, id DESC').all(type)
    : db.prepare('SELECT * FROM content ORDER BY type ASC, published DESC, sort_order ASC, id DESC').all();
  res.json({ code: 0, message: 'ok', data: rows });
});

/** POST / - 新建 */
router.post('/', (req: Request, res: Response) => {
  const { type, title, subtitle, content, image_url, extra_json, sort_order, published } = req.body ?? {};
  if (!type || !title) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'type / title 必填');
  if (!TYPES.includes(type as ContentType)) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '非法的内容类型');
  const db = getAuthDb();
  const result = db.prepare(`
    INSERT INTO content (type, title, subtitle, content, image_url, extra_json, sort_order, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(type), String(title),
    subtitle ? String(subtitle) : null,
    content !== undefined ? String(content) : null,
    image_url ? String(image_url) : null,
    extra_json !== undefined ? JSON.stringify(extra_json) : null,
    Number(sort_order ?? 0),
    published !== undefined ? (published ? 1 : 0) : 1
  );
  const row = db.prepare('SELECT * FROM content WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ code: 0, message: 'ok', data: row });
});

/** PUT /:id - 更新 */
router.put('/:id', (req, res) => {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM content WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '内容不存在');
  const fields = ['type', 'title', 'subtitle', 'content', 'image_url', 'extra_json', 'sort_order', 'published'];
  const sets: string[] = [];
  const vals: unknown[] = [];
  const body = req.body ?? {};
  for (const f of fields) {
    if (body[f] === undefined) continue;
    if (f === 'published') { sets.push('published = ?'); vals.push(body[f] ? 1 : 0); }
    else if (f === 'sort_order') { sets.push('sort_order = ?'); vals.push(Number(body[f])); }
    else if (f === 'extra_json') { sets.push('extra_json = ?'); vals.push(body[f] !== null ? JSON.stringify(body[f]) : null); }
    else { sets.push(`${f} = ?`); vals.push(body[f] ?? null); }
  }
  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id);
    db.prepare(`UPDATE content SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  const row = db.prepare('SELECT * FROM content WHERE id = ?').get(req.params.id);
  res.json({ code: 0, message: 'ok', data: row });
});

/** DELETE /:id - 软删除（置 published=0） */
router.delete('/:id', (req, res) => {
  const db = getAuthDb();
  const r = db.prepare('UPDATE content SET published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  if (r.changes === 0) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '内容不存在');
  res.json({ code: 0, message: 'ok', data: null });
});

/** POST /:id/publish - 切换上下架 */
router.post('/:id/publish', (req, res) => {
  const db = getAuthDb();
  const existing = db.prepare('SELECT published FROM content WHERE id = ?').get(req.params.id) as { published: number } | undefined;
  if (!existing) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '内容不存在');
  const next = existing.published ? 0 : 1;
  db.prepare('UPDATE content SET published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(next, req.params.id);
  res.json({ code: 0, message: 'ok', data: { id: Number(req.params.id), published: !!next } });
});

export default router;
