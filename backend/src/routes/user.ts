/**
 * @file 用户管理路由（管理员专属）
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { Router, type Request, type Response } from 'express';
import {
  listUsers, createUser, updateUser, resetUserPassword,
  type UserRole, type UserStatus
} from '../services/authService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

/** GET /api/v1/admin/users - 列表 */
router.get('/', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: listUsers() });
});

/** POST /api/v1/admin/users - 新增账号（可新建 admin，防滥用：只能由已有 admin 调此接口） */
router.post('/', (req: Request, res: Response) => {
  const { username, password, role, nickname } = req.body ?? {};
  if (!username || !password) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'username / password 必填');
  if (password.length < 6) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '密码至少 6 位');
  const safeRole = role === 'admin' || role === 'user' ? role as UserRole : 'user';
  const result = createUser(String(username), String(password), safeRole, nickname ? String(nickname) : undefined);
  if ('error' in result) {
    if (result.error === 'USERNAME_EXISTS') throw new HttpError(409, ErrorCodeEnum.INVALID_PARAM.code, '用户名已存在');
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, result.error);
  }
  res.status(201).json({ code: 0, message: 'ok', data: result });
});

/** PUT /api/v1/admin/users/:id - 修改角色/昵称/状态 */
router.put('/:id', (req, res) => {
  const { nickname, role, status } = req.body ?? {};
  const safeRole = role === 'admin' || role === 'user' ? role as UserRole : undefined;
  const safeStatus = status === 'active' || status === 'disabled' ? status as UserStatus : undefined;
  const changed = updateUser(Number(req.params.id), { nickname, role: safeRole, status: safeStatus });
  if (!changed) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '用户不存在');
  res.json({ code: 0, message: 'ok', data: null });
});

/** POST /api/v1/admin/users/:id/reset-password - 重置密码 */
router.post('/:id/reset-password', (req, res) => {
  const { password } = req.body ?? {};
  if (!password || String(password).length < 6) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '密码至少 6 位');
  }
  const ok = resetUserPassword(Number(req.params.id), String(password));
  if (!ok) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM.code, '用户不存在');
  res.json({ code: 0, message: 'ok', data: null });
});

export default router;
