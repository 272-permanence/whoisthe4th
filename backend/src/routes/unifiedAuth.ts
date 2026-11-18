/**
 * @file 统一身份认证路由：captcha + providers + 5 外部通道（email/phone/wechat/sso/cert）
 * @author 第八组（成员C）
 * @date 2026-11-18 反爬虫增强：各通道独立 IP 限流 + 验证码错误计入账号锁定 + 全局 IP 登录失败计数
 * @change 适配队友 11-18 改写的 unifiedAuthService.ts（函数名变更）
 *
 * 限流矩阵：
 *  captcha  GET     → captchaLimiter (60/min)
 *  email/code POST  → emailCodeSendLimiter (3/5min) + loginFailIpLimiter
 *  email/login POST → emailLoginLimiter (10/min)    + loginFailIpLimiter + 验证码错误 → 锁
 *  phone/code POST  → phoneCodeSendLimiter (3/5min) + loginFailIpLimiter
 *  phone/login POST → phoneLoginLimiter (10/min)    + loginFailIpLimiter + 验证码错误 → 锁
 *  sso/consume POST → ssoConsumeLimiter (10/min)    + loginFailIpLimiter + ticket 无效 → 锁
 *  cert/login POST  → certLoginLimiter (30/min)     + loginFailIpLimiter
 *  wechat/qr  GET/POST → 复用 certLoginLimiter（扫码天然不适合暴力）
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
  sendEmailCode, verifyEmailCode, loginByEmail,
  sendPhoneCode, verifyPhoneCode, loginByPhone,
  createWechatQr, getWechatQrStatus, simulateWechatScan, simulateWechatConfirm,
  loginBySsoTicket, getSsoConfig,
  loginByCertificate,
} from '../services/unifiedAuthService.js';
import { loginByExternal, recordLoginFail, recordLoginSuccess } from '../services/authService.js';
import { consumeTicket } from '../services/ssoPlatform.js';
import {
  captchaLimiter,
  emailCodeSendLimiter,
  phoneCodeSendLimiter,
  emailLoginLimiter,
  phoneLoginLimiter,
  ssoConsumeLimiter,
  certLoginLimiter,
  loginFailIpLimiter,
} from '../middleware/rateLimit.js';

const router = Router();

// Express 4 不自动捕获 async handler throw —— 0 依赖 wrapper，交给 app.ts 错误中间件
function wrap(fn: (req: Request, res: Response, next: any) => Promise<any> | any) {
  return (req: Request, res: Response, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function ok(res: Response, data: unknown) { res.json({ code: 0, message: 'ok', data }); }

function realIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function logLogin(req: Request, username: string | null, result: 'success' | string) {
  const traceId = (req as any).traceId ?? 'no-trace-id';
  const ip = realIp(req);
  const pino = getLoggerInstance();
  pino.info({ traceId, ip, maskedUser: username ? maskSingle(username) : null }, `统一认证登录: ${result}`);
  void saveLoginLog({ trace_id: traceId, username, ip, login_result: result }).catch(() => {});
}

// ==================== 公共：captcha + providers ====================

/** GET /api/v1/auth/captcha —— 获取图形验证码 */
router.get('/captcha', captchaLimiter, (_req, res) => {
  const data = generateCaptcha();
  ok(res, data);
});

/**
 * GET /api/v1/auth/providers —— 返回各通道当前模式（mock / smtp / sms / real）
 * 前端据此显示"演示模式"标识。
 */
router.get('/providers', (_req, res) => {
  const sso = getSsoConfig();
  ok(res, {
    // email / phone / wechat / cert 暂未做 config 驱动，默认 mock
    email: { mode: 'mock', exposeCode: false },
    phone: { mode: 'mock', exposeCode: false },
    wechat: { mode: 'mock', exposeCode: false },
    cert: { mode: 'mock', exposeCode: false },
    sso: { mode: sso.mode, loginUrl: sso.url, clientId: sso.clientId },
  });
});

// ==================== 邮箱验证码 ====================

/** POST /api/v1/auth/email/code —— 发送邮箱验证码 */
router.post('/email/code', emailCodeSendLimiter, loginFailIpLimiter, wrap(async (req, res) => {
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

/** POST /api/v1/auth/email/login —— 邮箱验证码登录 */
router.post('/email/login', emailLoginLimiter, loginFailIpLimiter, (req, res) => {
  const { email, code } = req.body ?? {};
  const ip = realIp(req);
  if (!email || !code) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '邮箱和验证码必填');

  const key = `email:${email}`;
  // 验证码校验 FIRST（队友版本 loginByEmail 不做）
  if (!verifyEmailCode(String(email), String(code))) {
    const lockedMs = recordLoginFail(key, ip);
    logLogin(req, String(email), 'fail_bad_code');
    if (lockedMs > 0) {
      const retryAfterSec = Math.ceil(lockedMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `该邮箱登录已被锁定，请 ${retryAfterSec} 秒后再试`);
    }
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '验证码错误或已过期');
  }

  const login = loginByEmail(String(email));
  if ('error' in login) {
    logLogin(req, String(email), `fail_${(login as any).error}`);
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, (login as any).error || '登录失败');
  }

  recordLoginSuccess(key);
  logLogin(req, String(email), 'success');
  ok(res, login);
});

// ==================== 手机号验证码 ====================

/** POST /api/v1/auth/phone/code —— 发送短信验证码 */
router.post('/phone/code', phoneCodeSendLimiter, loginFailIpLimiter, wrap(async (req, res) => {
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

/** POST /api/v1/auth/phone/login —— 手机号验证码登录 */
router.post('/phone/login', phoneLoginLimiter, loginFailIpLimiter, (req, res) => {
  const { phone, code } = req.body ?? {};
  const ip = realIp(req);
  if (!phone || !code) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '手机号和验证码必填');

  const key = `phone:${phone}`;
  if (!verifyPhoneCode(String(phone), String(code))) {
    const lockedMs = recordLoginFail(key, ip);
    logLogin(req, String(phone), 'fail_bad_code');
    if (lockedMs > 0) {
      const retryAfterSec = Math.ceil(lockedMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `该手机号登录已被锁定，请 ${retryAfterSec} 秒后再试`);
    }
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '验证码错误或已过期');
  }

  const login = loginByPhone(String(phone));
  if ('error' in login) {
    logLogin(req, String(phone), `fail_${(login as any).error}`);
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, (login as any).error || '登录失败');
  }

  recordLoginSuccess(key);
  logLogin(req, String(phone), 'success');
  ok(res, login);
});

// ==================== 统一认证平台（真实 SSO 模拟平台） ====================

/** GET /api/v1/auth/sso/config —— 前端点"前往统一认证"时读这个拿 redirectUrl */
router.get('/sso/config', (_req, res) => {
  const sso = getSsoConfig();
  ok(res, { mode: sso.mode, loginUrl: sso.url, clientId: sso.clientId });
});

/** POST /api/v1/auth/sso/consume —— 前端回调页拿 ticket 后调这个换 JWT */
router.post('/sso/consume', ssoConsumeLimiter, loginFailIpLimiter, (req, res) => {
  const { ticket } = req.body ?? {};
  const ip = realIp(req);
  if (!ticket || typeof ticket !== 'string') {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'ticket 缺失');
  }
  const consumed = consumeTicket(ticket.trim());
  if (!consumed) {
    const lockedMs = recordLoginFail('sso:anonymous', ip);
    logLogin(req, null, 'fail_sso_ticket_invalid');
    if (lockedMs > 0) {
      const retryAfterSec = Math.ceil(lockedMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      throw new HttpError(423, ErrorCodeEnum.FORBIDDEN, `SSO ticket 请求已被锁定，请 ${retryAfterSec} 秒后再试`);
    }
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, 'ticket 无效或已过期（30 秒内有效 + 一次性消费）');
  }

  const login = loginBySsoTicket(ticket.trim());
  if ('error' in login) {
    const key = `sso:${consumed.sid}`;
    recordLoginFail(key, ip);
    logLogin(req, consumed.sid, `fail_sso_${(login as any).error}`);
    throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, 'SSO 登录失败');
  }

  const key = `sso:${consumed.sid}`;
  recordLoginSuccess(key);
  logLogin(req, consumed.sid, 'success');
  ok(res, {
    ...login,
    ssoUser: { sid: consumed.sid, nickname: consumed.nickname, org: consumed.org }
  });
});

/** POST /api/v1/auth/sso/mock-login —— 保留兼容（某些地方可能还在调） */
router.post('/sso/mock-login', ssoConsumeLimiter, loginFailIpLimiter, (req, res) => {
  const { ticket } = req.body ?? {};
  const ip = realIp(req);
  if (ticket) {
    const consumed = consumeTicket(String(ticket).trim());
    if (consumed) {
      const login = loginBySsoTicket(String(ticket).trim());
      if (!('error' in login)) {
        recordLoginSuccess(`sso:${consumed.sid}`);
        logLogin(req, consumed.sid, 'success');
        ok(res, { ...login, ssoUser: { sid: consumed.sid, nickname: consumed.nickname, org: consumed.org } });
        return;
      }
    } else {
      recordLoginFail('sso:anonymous', ip);
    }
  }
  // mock 兜底（第一次建号）
  const login = loginByExternal('sso', 'sso_20260001', '张三');
  if ('error' in login) throw new HttpError(500, ErrorCodeEnum.INTERNAL_ERROR, '登录失败');
  recordLoginSuccess('sso:sso_20260001');
  logLogin(req, null, 'success');
  ok(res, login);
});

// ==================== 微信扫码（mock，天然不适合暴力） ====================

/** POST /api/v1/auth/wechat/qr —— 创建扫码会话 */
router.post('/wechat/qr', certLoginLimiter, loginFailIpLimiter, (_req, res) => {
  ok(res, createWechatQr());
});

/** GET /api/v1/auth/wechat/qr/:sceneId —— 轮询扫码状态 */
router.get('/wechat/qr/:sceneId', certLoginLimiter, (req, res) => {
  ok(res, getWechatQrStatus(req.params.sceneId));
});

/** POST /api/v1/auth/wechat/qr/:sceneId/mock-scan —— mock：模拟扫码 */
router.post('/wechat/qr/:sceneId/mock-scan', certLoginLimiter, (req, res) => {
  simulateWechatScan(req.params.sceneId);
  ok(res, { status: 'scanned' });
});

/** POST /api/v1/auth/wechat/qr/:sceneId/mock-confirm —— mock：模拟确认登录 */
router.post('/wechat/qr/:sceneId/mock-confirm', certLoginLimiter, loginFailIpLimiter, (req, res) => {
  const state = getWechatQrStatus(req.params.sceneId);
  const confirmed = simulateWechatConfirm(req.params.sceneId);
  if (confirmed && !('error' in confirmed)) {
    logLogin(req, null, 'success');
  } else {
    logLogin(req, null, 'fail_wechat_confirm');
  }
  ok(res, state);
});

// ==================== 数字证书 ====================

const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

/** POST /api/v1/auth/cert/login（multipart/form-data，字段名 cert） */
router.post('/cert/login', certLoginLimiter, loginFailIpLimiter, certUpload.single('cert'), wrap(async (req, res) => {
  const ip = realIp(req);
  if (!req.file) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '请上传证书文件（multipart 字段 cert）');
  const login = loginByCertificate(req.file);
  if ('error' in login) {
    recordLoginFail('cert:anonymous', ip);
    logLogin(req, null, 'fail_cert_invalid');
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, (login as any).error || '证书无效');
  }
  logLogin(req, null, 'success');
  ok(res, login);
}));

export default router;
