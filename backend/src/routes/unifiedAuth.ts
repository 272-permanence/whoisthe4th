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
import { config } from '../config.js';
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
    email: { mode: config.unified.email.provider, exposeCode: config.unified.email.exposeCode },
    phone: { mode: config.unified.phone.provider, exposeCode: config.unified.phone.exposeCode },
    wechat: { mode: config.unified.wechat.mock ? 'mock' : 'real', exposeCode: false },
    cert: { mode: config.unified.cert.mode, exposeCode: false },
    sso: { mode: sso.mode, loginUrl: sso.url, clientId: sso.clientId },
  });
});

// ==================== 邮箱验证码 ====================

/** POST /api/v1/auth/email/code —— 发送邮箱验证码 */
router.post('/email/code', emailCodeSendLimiter, loginFailIpLimiter, wrap(async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !EMAIL_REGEX.test(email)) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '邮箱格式错误');
  const r = await sendEmailCode(String(email));
  if ('error' in r) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, r.error);
  ok(res, r);
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
  const r = await sendPhoneCode(String(phone));
  if ('error' in r) throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, r.error);
  ok(res, r);
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

/**
 * GET /api/v1/auth/wechat/scan?sceneId=xxx
 * —— 微信扫一扫打开的真实登录入口页（零资质演示模式）
 *
 * 用户手机微信扫码 → 微信浏览器打开这个 URL →
 * 后端自动 simulateWechatScan + simulateWechatConfirm →
 * 返回一个简洁的手机端"登录成功"提示页 →
 * 电脑端前端轮询看到 confirmed + login → 跳转首页
 */
router.get('/wechat/scan', (req, res) => {
  const sceneId = String(req.query.sceneId ?? '');
  if (!sceneId.startsWith('qr_')) {
    res.type('html').send(wechatScanHtml('❌ 无效的二维码参数，请重新扫描', false));
    return;
  }

  const session = getWechatQrStatus(sceneId);
  if (!session) {
    res.type('html').send(wechatScanHtml('❌ 二维码已过期，请在电脑端刷新后重新扫描', false));
    return;
  }
  if (session.status === 'expired') {
    res.type('html').send(wechatScanHtml('⏰ 二维码已过期，请在电脑端刷新后重新扫描', false));
    return;
  }

  // 自动扫码 + 确认 —— 电脑端轮询会立刻看到 confirmed
  simulateWechatScan(sceneId);
  const confirmed = simulateWechatConfirm(sceneId);
  if (!confirmed || 'error' in confirmed) {
    res.type('html').send(wechatScanHtml('❌ 登录失败，请重试', false));
    return;
  }

  // 审计日志：这里是手机端微信扫的，直接打 pino，saveLoginLog 会因为 MySQL 没跑自动吞掉
  const pino = getLoggerInstance();
  pino.info({ traceId: 'wechat-scan', ip: 'mobile-wechat', maskedUser: null }, '统一认证登录: success (wechat scan)');

  res.type('html').send(wechatScanHtml(
    '✅ 登录成功！请回到电脑端查看',
    true
  ));
});

/** 微信扫一扫打开的手机端 HTML（内联，不依赖外部资源） */
function wechatScanHtml(message: string, success: boolean): string {
  const color = success ? '#07c160' : '#fa5151';
  const bg = success ? '#e8f8ef' : '#fde8e8';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>景区AI · 微信登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;background:#f5f6f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;padding:48px 32px;text-align:center;max-width:360px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.06)}
.icon{font-size:64px;margin-bottom:20px}
.msg{font-size:18px;color:${color};font-weight:500;line-height:1.5;margin-bottom:8px}
.sub{font-size:14px;color:#999;margin-top:16px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle}
.detail{background:${bg};border-radius:8px;padding:12px 16px;font-size:13px;color:#666;margin-top:24px;line-height:1.6}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🎉' : '😅'}</div>
    <div class="msg"><span class="dot"></span>${message}</div>
    <div class="detail">
      ${success
        ? '电脑端登录页正在自动跳转…<br>如果没动，请回到电脑端看一下。'
        : '二维码是电脑端登录时动态生成的，扫之前请先确认电脑端页面正常。'
      }
    </div>
    <p class="sub">景区AI · 微信扫码登录</p>
  </div>
  <script>
  // 给电脑端多一次机会 —— 如果手机端打开后几秒内电脑端轮询还没拿到，
  // 这里再调一次 confirm（幂等，不会重复创建账号）
  </script>
</body>
</html>`;
}

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
