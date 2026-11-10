/**
 * @file 认证路由：/api/v1/auth/login | register | me
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @date 2026-11-10（B 注入 saveLoginLog，脱敏 username）
 */
import { Router, type Request, type Response } from 'express';
import { login, register, getUserById } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';
import { maskSingle } from '../utils/mask.js';
import { saveLoginLog } from '../services/logService.js';
import { getLoggerInstance } from '../common/logger.js';

const router = Router();

/** POST /api/v1/auth/login */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  const pino = getLoggerInstance();
  const traceId = (req as Request & { traceId?: string }).traceId ?? 'no-trace-id';
  const ip = req.ip ?? null;
  const maskedUsername = typeof username === 'string' ? maskSingle(username) : null;

  if (!username || !password) {
    pino.warn({ traceId, ip, maskedUsername }, '登录拦截：参数缺失');
    void saveLoginLog({
      trace_id: traceId,
      username: maskedUsername,
      ip,
      login_result: 'fail_param_missing',
      fail_reason: 'username / password 必填'
    }).catch(() => {});
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'username / password 必填');
  }

  const result = login(String(username), String(password));
  if ('error' in result) {
    const failReason = result.error;
    pino.warn({ traceId, ip, maskedUsername, failReason }, '登录失败');
    void saveLoginLog({
      trace_id: traceId,
      username: maskedUsername,
      ip,
      login_result: `fail_${failReason.toLowerCase()}`,
      fail_reason: failReason
    }).catch(() => {});

    if (result.error === 'USER_DISABLED') {
      throw new HttpError(403, ErrorCodeEnum.FORBIDDEN, '账号已禁用');
    }
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '用户名或密码错误');
  }

  // 登录成功
  pino.info({ traceId, ip, userId: result.user.id }, '登录成功');
  void saveLoginLog({
    trace_id: traceId,
    username: maskedUsername,
    ip,
    login_result: 'success'
  }).catch(() => {});

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
