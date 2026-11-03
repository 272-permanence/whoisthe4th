/**
 * @file 认证路由：登录 / 注册 / 获取当前用户
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 前缀：/api/v1/auth
 */
import { Router, type Request, type Response } from 'express';
import { login, register } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/**
 * 注册
 * POST /api/v1/auth/register
 * body: { username, password, role?, nickname? }
 */
router.post('/register', (req: Request, res: Response) => {
  const { username, password, role, nickname } = (req.body ?? {}) as {
    username?: string;
    password?: string;
    role?: 'admin' | 'user';
    nickname?: string;
  };
  if (!username || !password) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'username 和 password 不能为空' });
    return;
  }
  if (username.length < 3 || username.length > 32) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: '用户名长度 3-32' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: '密码至少 6 位' });
    return;
  }
  try {
    const result = register({ username, password, role, nickname });
    res.json({ code: 0, message: '注册成功', data: result });
  } catch (err) {
    if ((err as Error).message === 'USERNAME_EXISTS') {
      res.status(409).json({ code: ErrorCodeEnum.USERNAME_EXISTS, message: '用户名已存在' });
      return;
    }
    throw err;
  }
});

/**
 * 登录
 * POST /api/v1/auth/login
 * body: { username, password }
 */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'username 和 password 不能为空' });
    return;
  }
  try {
    const result = login(username, password);
    res.json({ code: 0, message: '登录成功', data: result });
  } catch (err) {
    if ((err as Error).message === 'BAD_CREDENTIALS') {
      res.status(401).json({ code: ErrorCodeEnum.BAD_CREDENTIALS, message: '用户名或密码错误' });
      return;
    }
    throw err;
  }
});

/**
 * 获取当前登录用户信息（鉴权测试接口）
 * GET /api/v1/auth/me
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ code: 0, message: 'ok', data: req.user });
});

export default router;
