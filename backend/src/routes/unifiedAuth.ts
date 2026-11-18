/**
 * @file 统一身份认证路由：captcha + providers + 5 外部通道（email/phone/wechat/sso/cert）
 * @author 第八组（成员C）
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';
import { maskSingle } from '../utils/mask.js';
import { saveLoginLog } from '../services/logService.js';
import { getLoggerInstance } from '../common/logger.js';
import { generateCaptcha, verifyCaptcha } from '../services/captchaService.js';
import {
  sendEmailCode, verifyEmailCode,
  sendPhoneCode, verifyPhoneCode,
  createWechatQr, pollWechatQr, mockWechatScan, mockWechatConfirm,
  loginByCert,
  getProvidersStatus,
} from '../services/unifiedAuthService.js';
import { loginByExternal } from '../services/authService.js';
import { consumeTicket } from '../services/ssoPlatform.js';

const router = Router();

// Express 4 不自动捕获 async handler throw —— 0 依赖 wrapper，交给 app.ts 错误中间件
function wrap(fn: (req: Request, res: Response, next: any) => Promise<any> | any) {
  return (req: Request, res: Response, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function ok(res: Response, data: unknown) { res.json({ code: 0, message: 'ok', data }); }

function logLogin(req: Request, username: string | null, result: 'success' | string) {
  const traceId = (req as any).traceId ?? 'no-trace-id';
  const ip = req.ip ?? null;
  const pino = getLoggerInstance();
  pino.info({ traceId, ip, maskedUser: username ? maskSingle(username) : null }, `统一认证登录: ${result}`);
  void saveLoginLog({ trace_id: traceId, username, ip, login_result: result }).catch(() => {});
}

// ==================== 公共：captcha + providers ====================

/** GET /api/v1/auth/captcha */
router.get('/captcha', (_req, res) => {
  const data = generateCaptcha();
  ok(res, data);
});

/** GET /api/v1/auth/providers */
router.get('/providers', (_req, res) => {
  ok(res, getProvidersStatus());
});

// ==================== 邮箱验证码 ====================

/** POST /api/v1/auth/email/code */
router.post('/email/code', wrap(async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !EMAIL_REGEX.test(email)) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '邮箱格式错误');
  try {
    const r = await sendEmailCode(String(email));
    ok(res, r);
  } catch (e: any) {
    if (e.status === 429) throw new HttpError(429, ErrorCodeEnum.RATE_LIMITED, e.message);
    throw new HttpError(502, ErrorCodeEnum.EXTERNAL_ERROR, e.message);
  }
}));

/** POST /api/v1/auth/email/login */
router.post('/email/login', (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '邮箱和验证码必填');
  if (!verifyEmailCode(String(email), String(code))) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '验证码错误或已过期');
  const login = loginByExternal('email', String(email));
  if ('error' in login) throw login.error === 'USER_DISABLED'
    ? new HttpError(403, ErrorCodeEnum.FORBIDDEN, '账号已禁用')
    : new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '登录失败');
  logLogin(req, String(email), 'success');
  ok(res, login);
});

// ==================== 手机号验证码 ====================

/** POST /api/v1/auth/phone/code */
router.post('/phone/code', wrap(async (req, res) => {
  const { phone } = req.body ?? {};
  if (!phone || !PHONE_REGEX.test(phone)) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '请输入正确的 11 位手机号');
  try {
    const r = await sendPhoneCode(String(phone));
    ok(res, r);
  } catch (e: any) {
    if (e.status === 429) throw new HttpError(429, ErrorCodeEnum.RATE_LIMITED, e.message);
    throw new HttpError(502, ErrorCodeEnum.EXTERNAL_ERROR, e.message);
  }
}));

/** POST /api/v1/auth/phone/login */
router.post('/phone/login', (req, res) => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '手机号和验证码必填');
  if (!verifyPhoneCode(String(phone), String(code))) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '验证码错误或已过期');
  const login = loginByExternal('phone', String(phone));
  if ('error' in login) throw login.error === 'USER_DISABLED'
    ? new HttpError(403, ErrorCodeEnum.FORBIDDEN, '账号已禁用')
    : new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '登录失败');
  logLogin(req, String(phone), 'success');
  ok(res, login);
});

// ==================== 统一认证平台（真实 SSO 模拟平台） ====================

/** GET /api/v1/auth/sso/config */
router.get('/sso/config', (_req, res) => {
  const p = getProvidersStatus();
  ok(res, {
    mode: p.sso.mode,
    // 前端点"前往统一认证"时用这个地址跳转
    loginUrl: '/sso-platform/login',
    clientId: p.sso.clientId
  });
});

/** POST /api/v1/auth/sso/consume — 前端回调页拿 ticket 后调这个换 JWT */
router.post('/sso/consume', (req, res) => {
  const { ticket } = req.body ?? {};
  if (!ticket || typeof ticket !== 'string') {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'ticket 缺失');
  }
  const consumed = consumeTicket(ticket.trim());
  if (!consumed) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'ticket 无效或已过期（30 秒内有效 + 一次性消费）');
  }
  // 用 SSO 平台返回的学号 + 昵称 → 走统一外部登录入口
  const login = loginByExternal('sso', consumed.sid, consumed.nickname);
  if ('error' in login) throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, 'SSO 登录失败');
  logLogin(req, consumed.sid, 'success');
  ok(res, {
    ...login,
    ssoUser: { sid: consumed.sid, nickname: consumed.nickname, org: consumed.org }
  });
});

/** POST /api/v1/auth/sso/mock-login — 保留兼容（某些地方可能还在调） */
router.post('/sso/mock-login', (req, res) => {
  const { ticket } = req.body ?? {};
  // 如果有 ticket → 走真实 SSO consume；否则用默认学号（纯 mock 兜底）
  if (ticket) {
    const consumed = consumeTicket(String(ticket).trim());
    if (consumed) {
      const login = loginByExternal('sso', consumed.sid, consumed.nickname);
      if (!('error' in login)) {
        logLogin(req, consumed.sid, 'success');
        ok(res, { ...login, ssoUser: { sid: consumed.sid, nickname: consumed.nickname, org: consumed.org } });
        return;
      }
    }
  }
  // mock 兜底（第一次建号）
  const login = loginByExternal('sso', 'sso_20260001', '张三');
  if ('error' in login) throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '登录失败');
  logLogin(req, null, 'success');
  ok(res, login);
});

// ==================== 微信扫码（mock） ====================

/** POST /api/v1/auth/wechat/qr */
router.post('/wechat/qr', (_req, res) => {
  ok(res, createWechatQr());
});

/** GET /api/v1/auth/wechat/qr/:sceneId */
router.get('/wechat/qr/:sceneId', (req, res) => {
  ok(res, pollWechatQr(req.params.sceneId));
});

/** POST /api/v1/auth/wechat/qr/:sceneId/mock-scan */
router.post('/wechat/qr/:sceneId/mock-scan', (req, res) => {
  mockWechatScan(req.params.sceneId);
  ok(res, { status: 'scanned' });
});

/** POST /api/v1/auth/wechat/qr/:sceneId/mock-confirm */
router.post('/wechat/qr/:sceneId/mock-confirm', (req, res) => {
  mockWechatConfirm(req.params.sceneId);
  ok(res, pollWechatQr(req.params.sceneId));
});

// ==================== 数字证书 ====================

const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

/** POST /api/v1/auth/cert/login（multipart/form-data，字段名 cert） */
router.post('/cert/login', certUpload.single('cert'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '请上传证书文件（multipart 字段 cert）');
  try {
    const login = loginByCert(req.file.buffer);
    logLogin(req, null, 'success');
    ok(res, login);
  } catch (e: any) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, e.message);
  }
}));

export default router;
