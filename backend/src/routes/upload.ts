/**
 * @file 图片上传路由（admin 专属，挂在 /api/v1/admin/upload）
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description CMS 内容图片上传：multer diskStorage 存到 backend/uploads/，
 *              返回 { url } 供前端直接填入 image_url 字段。
 *              静态访问由 app.ts 的 express.static 提供（/uploads/xxx.jpg）。
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../..');
export const UPLOAD_DIR = path.resolve(BACKEND_ROOT, 'uploads');

// 启动时确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${rand}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new HttpError(400, ErrorCodeEnum.INVALID_PARAM, `不支持的图片类型: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  }
});

const router = Router();
router.use(requireAuth, requireRole('admin'));

/** POST / - 上传图片，字段名 image，返回 { url } */
router.post('/', upload.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '未收到图片文件（字段名应为 image）');
  }
  // 返回相对 URL，前端拼接 baseURL 即可访问
  res.status(201).json({
    code: 0,
    message: 'ok',
    data: {
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size
    }
  });
});

export default router;
