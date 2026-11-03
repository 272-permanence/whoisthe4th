/**
 * @file CMS 内容路由（公开接口）
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 只提供已发布内容的公开读取：GET /:type
 *              管理端完整接口见 routes/adminContent.ts（挂在 /api/v1/admin/content）
 */
import { Router, type Response } from 'express';
import { getAuthDb, type ContentType } from '../services/authDb.js';

const router = Router();

interface ContentRow {
  id: number; type: string; title: string; subtitle: string | null;
  content: string | null; image_url: string | null; extra_json: string | null;
  sort_order: number; published: number; created_at: string; updated_at: string;
}

const TYPES: ContentType[] = ['carousel', 'scenic', 'route', 'announcement', 'about'];

/** GET /api/v1/content/:type - 公开列表（仅 published=1，按 sort_order 升序） */
router.get('/:type', (req, res: Response) => {
  const type = req.params.type as ContentType;
  if (!TYPES.includes(type)) {
    res.status(400).json({ code: 400, message: '非法的内容类型' });
    return;
  }
  const db = getAuthDb();
  const rows = db
    .prepare('SELECT * FROM content WHERE type = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
    .all(type) as ContentRow[];
  const out = rows.map(r => {
    const extra = r.extra_json ? (() => { try { return JSON.parse(r.extra_json!); } catch { return null; } })() : null;
    return { ...r, extra };
  });
  res.json({ code: 0, message: 'ok', data: out });
});

export default router;
