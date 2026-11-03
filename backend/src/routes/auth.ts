/**
 * @file 认证路由：/api/v1/auth/login | register | me
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { Router, type Request, type Response } from 'express';
import { login, register, getUserById } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/** POST /api/v1/auth/login */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'username / password 必填');
  }
  const result = login(String(username), String(password));
  if ('error' in result) {
    if (result.error === 'USER_DISABLED') {
      throw new HttpError(403, ErrorCodeEnum.FORBIDDEN, '账号已禁用');
    }
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '用户名或密码错误');
  }
  res.json({ code: 0, message: 'ok', data: result });
});

/** POST /api/v1/auth/register */
router.post('/register', (req: Request, res: Response) => {
  const { username, password, nickname } = req.body ?? {};
  if (!username || !password) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'username / password 必填');
  }
  if (String(password).length < 6) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '密码至少 6 位');
  }
  // 开放注册强制 user 角色，管理员账号只能由已有管理员添加
  const result = register(String(username), String(password), nickname ? String(nickname) : undefined);
  if ('error' in result) {
    if (result.error === 'USERNAME_EXISTS') {
      throw new HttpError(409, ErrorCodeEnum.INVALID_PARAM, '用户名已存在');
    }
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, result.error);
  }
  res.status(201).json({ code: 0, message: 'ok', data: result });
});

/** GET /api/v1/auth/me */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = getUserById(req.user!.uid);
  if (!user) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM, '用户不存在');
  res.json({ code: 0, message: 'ok', data: user });
});

export default router;
