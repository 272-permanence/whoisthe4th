/**
 * @file 认证路由：/api/v1/auth/login | register | me | lock-debug
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @date 2026-11-10（B 注入 saveLoginLog，脱敏 username）
 * @date 2026-11-18（C 新增 IP 限流 + 账号锁定）
 *
 * 反爬虫策略：
 *  - passwordLoginLimiter：密码登录 1min 10 次/IP
 *  - loginFailIpLimiter：全局登录失败 1h 20 次/IP → 锁 15min
 *  - registerLimiter：注册 1h 5 次/IP
 *  - 账号锁定：连续 5 次密码错误 → 锁 15min（内存 Map）
 */
import { Router, type Request, type Response } from 'express';
import { login, register, getUserById, recordLoginFail, recordLoginSuccess, getLockSnapshot } from '../services/authService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';
import { maskSingle } from '../utils/mask.js';
import { saveLoginLog } from '../services/logService.js';
import { getLoggerInstance } from '../common/logger.js';
import { verifyCaptcha } from '../services/captchaService.js';
import {
  passwordLoginLimiter,
  loginFailIpLimiter,
  registerLimiter,
} from '../middleware/rateLimit.js';

const router = Router();

/** 图形验证码在密码校验之前，防止被暴力撞库 */
function assertCaptcha(captchaId?: string, captchaCode?: string): void {
  if (!captchaId || !captchaCode) throw new HttpError(400, ErrorCodeEnum.CAPTCHA_INVALID, '验证码必填');
  if (!verifyCaptcha(String(captchaId), String(captchaCode))) throw new HttpError(401, ErrorCodeEnum.CAPTCHA_INVALID, '验证码错误或已过期');
}

/** 获取客户端真实 IP（支持 x-forwarded-for） */
function realIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

/**
 * POST /api/v1/auth/login
 * 密码登录通道：图形验证码 FIRST → bcrypt → JWT
 * 反爬虫：IP 限流 + 账号锁定 + 登录失败 IP 计数器
 */
router.post('/login', passwordLoginLimiter, loginFailIpLimiter, (req: Request, res: Response) => {
  const { username, password, captchaId, captchaCode } = req.body ?? {};
  const pino = getLoggerInstance();
  const traceId = (req as Request & { traceId?: string }).traceId ?? 'no-trace-id';
  const ip = realIp(req);
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

  // 图形验证码 FIRST —— 在密码 bcrypt 之前校验，防止撞库
  assertCaptcha(captchaId, captchaCode);

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

    // 11-18：BAD_CREDENTIALS 才计入账号锁定；其他错误不计
    if (result.error === 'BAD_CREDENTIALS') {
      const lockedMs = recordLoginFail(String(username), ip);
      if (lockedMs > 0) {
        const retryAfterSec = Math.ceil(lockedMs / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        pino.warn({ username: maskedUsername, ip }, `账号已锁定 ${retryAfterSec}s`);
        throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `账号已被锁定，请 ${retryAfterSec} 秒后再试`);
      }
      throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '用户名或密码错误');
    }
    if (result.error === 'ACCOUNT_LOCKED') {
      // 已在 login() 入口拦截，理论上不会走到这里；兜底返回 423
      const lockedMs = (result as any).lockedMs ?? 15 * 60 * 1000;
      const retryAfterSec = Math.ceil(lockedMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `账号已被锁定，请 ${retryAfterSec} 秒后再试`);
    }
    if (result.error === 'USER_DISABLED') {
      throw new HttpError(403, ErrorCodeEnum.FORBIDDEN, '账号已禁用');
    }
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED, '登录失败');
  }

  // 登录成功 → 清除失败计数（防止锁残留）
  recordLoginSuccess(String(username));

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

/**
 * POST /api/v1/auth/register
 * 开放注册：只允许 user 角色，图形验证码 + IP 限流
 */
router.post('/register', registerLimiter, (req: Request, res: Response) => {
  const { username, password, nickname, captchaId, captchaCode } = req.body ?? {};
  if (!username || !password) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'username / password 必填');
  }
  if (String(password).length < 6) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '密码至少 6 位');
  }
  assertCaptcha(captchaId, captchaCode);
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

/** GET /api/v1/auth/me —— 获取当前登录用户 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = getUserById(req.user!.uid);
  if (!user) throw new HttpError(404, ErrorCodeEnum.INVALID_PARAM, '用户不存在');
  res.json({ code: 0, message: 'ok', data: user });
});

/**
 * GET /api/v1/auth/lock-debug —— 调试接口：查看当前所有账号锁定状态
 * 仅 admin 可访问，防止泄露用户隐私。
 */
router.get('/lock-debug', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ code: 0, message: 'ok', data: getLockSnapshot() });
});

export default router;
