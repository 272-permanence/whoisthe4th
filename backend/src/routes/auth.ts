/**
 * @file 认证路由：/api/v1/auth/captcha | login | register | me
 * @author 第八组（成员C）
 * @date 2026-11-03
 */
import { Router, type Request, type Response } from 'express';
import { login, register, getUserById, findUserByUsername, updateUser, resetUserPassword } from '../services/authService.js';
import bcrypt from 'bcryptjs';
import { getAuthDb } from '../services/authDb.js';
import { requireAuth } from '../middleware/auth.js';
import { saveLoginLog, type LoginResult } from '../services/logService.js';
import { createCaptcha, verifyCaptcha } from '../services/captchaService.js';
import { maskSingle } from '../utils/mask.js';
import { clientIp } from '../utils/ip.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/** GET /api/v1/auth/captcha - 获取图形验证码 */
router.get('/captcha', (_req: Request, res: Response) => {
  const { captchaId, svg, expiresIn } = createCaptcha();
  res.json({ code: 0, message: 'ok', data: { captchaId, svg, expiresIn } });
});

/**
 * 校验证码，不通过直接抛 400
 * @param captchaId 验证码 ID
 * @param captchaCode 用户输入的验证码
 */
function assertCaptcha(captchaId: unknown, captchaCode: unknown): void {
  if (!captchaId || !captchaCode) {
    throw new HttpError(400, ErrorCodeEnum.CAPTCHA_INVALID.code, '请输入验证码');
  }
  if (!verifyCaptcha(String(captchaId), String(captchaCode))) {
    throw new HttpError(400, ErrorCodeEnum.CAPTCHA_INVALID.code, '验证码错误或已过期，请重新输入');
  }
}

/** POST /api/v1/auth/login */
router.post('/login', (req: Request, res: Response) => {
  const { username, password, captchaId, captchaCode } = req.body ?? {};
  if (!username || !password) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'username / password 必填');
  }
  // 验证码在密码校验之前，避免被暴力撞库
  assertCaptcha(captchaId, captchaCode);

  const traceId = req.traceId ?? '-';
  const ip = clientIp(req);
  // 日志中不落明文账号
  const maskedUsername = maskSingle(String(username));

  const result = login(String(username), String(password));
  if ('error' in result) {
    let loginResult: LoginResult;
    let error: HttpError;

    if (result.error === 'USER_DISABLED') {
      loginResult = 'fail_user_disabled';
      error = new HttpError(403, ErrorCodeEnum.FORBIDDEN.code, '账号已禁用');
    } else {
      // 仅写日志区分「用户不存在」与「密码错误」，对外仍统一提示
      loginResult = findUserByUsername(String(username)) ? 'fail_wrong_password' : 'fail_user_not_found';
      error = new HttpError(401, ErrorCodeEnum.UNAUTHORIZED.code, '用户名或密码错误');
    }

    saveLoginLog({ traceId, username: maskedUsername, ip, loginResult });
    throw error;
  }

  saveLoginLog({ traceId, username: maskedUsername, ip, loginResult: 'success' });
  res.json({ code: 0, message: 'ok', data: result });
});

/** POST /api/v1/auth/register */
router.post('/register', (req: Request, res: Response) => {
  const { username, password, nickname, captchaId, captchaCode } = req.body ?? {};
  if (!username || !password) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'username / password 必填');
  }
  if (String(password).length < 6) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '密码至少 6 位');
  }
  assertCaptcha(captchaId, captchaCode);
  // 开放注册强制 user 角色，管理员账号只能由已有管理员添加
  const result = register(String(username), String(password), nickname ? String(nickname) : undefined);
  if ('error' in result) {
    if (result.error === 'USERNAME_EXISTS') {
      throw new HttpError(409, ErrorCodeEnum.INVALID_PARAM.code, '用户名已存在');
    }
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, result.error);
  }
  res.status(201).json({ code: 0, message: 'ok', data: result });
});

/** GET /api/v1/auth/me */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = getUserById(req.user!.uid);
  if (!user) throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '用户不存在');
  res.json({ code: 0, message: 'ok', data: user });
});

/** PATCH /api/v1/auth/me — 修改昵称（当前登录用户改自己） */
router.patch('/me', requireAuth, (req: Request, res: Response) => {
  const { nickname } = req.body ?? {};
  // 只允许改 nickname；role / status 走 admin 用户管理接口
  if (nickname === undefined) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'nickname 必填');
  }
  const name = String(nickname).trim();
  if (name.length > 32) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '昵称不能超过 32 个字符');
  }
  const ok = updateUser(req.user!.uid, { nickname: name || undefined });
  if (!ok) throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '用户不存在');
  const user = getUserById(req.user!.uid)!;
  res.json({ code: 0, message: 'ok', data: user });
});

/** PATCH /api/v1/auth/password — 修改密码（需校验旧密码） */
router.patch('/password', requireAuth, (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || !newPassword) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, 'oldPassword / newPassword 必填');
  }
  if (String(newPassword).length < 6) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '新密码至少 6 位');
  }
  // 从原表读出 password_hash 来校验旧密码（getUserById 返回的是 toSafeUser，不含哈希）
  const db = getAuthDb();
  const row = db.prepare('SELECT password_hash FROM admin_user WHERE id = ?').get(req.user!.uid) as
    | { password_hash: string }
    | undefined;
  if (!row) throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '用户不存在');
  if (!bcrypt.compareSync(String(oldPassword), row.password_hash)) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '旧密码不正确');
  }
  resetUserPassword(req.user!.uid, String(newPassword));
  res.json({ code: 0, message: 'ok', data: null });
});

export default router;
