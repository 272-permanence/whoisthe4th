/**
 * @file 统一身份认证路由（挂在 /api/v1/auth 下，与账号密码通道并行）
 * @author 第八组（成员C）
 * @date 2026-11-10
 * @description 提供四种登录通道：
 *              - 邮件验证码：POST /email/code、POST /email/login
 *              - 微信扫码：POST /wechat/qr、GET /wechat/qr/:sceneId、mock-scan / mock-confirm
 *              - 统一认证平台：GET /sso/config、POST /sso/mock-login
 *              - 数字证书：POST /cert/login（multipart，字段名 cert）
 *              默认全部 mock，真实对接只需改 unifiedAuthService 对应分支
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import {
  sendEmailCode,
  verifyEmailCode,
  isValidEmail,
  normalizeEmail,
  loginByEmail,
  sendPhoneCode,
  verifyPhoneCode,
  isValidPhone,
  loginByPhone,
  createWechatQr,
  getWechatQrStatus,
  simulateWechatScan,
  simulateWechatConfirm,
  getSsoConfig,
  loginBySsoTicket,
  loginByCertificate,
  type LoginOutcome
} from '../services/unifiedAuthService.js';
import { saveLoginLog } from '../services/logService.js';
import { maskSingle } from '../utils/mask.js';
import { clientIp } from '../utils/ip.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/** 证书上传：内存态，最大 2MB */
const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

/**
 * 统一输出登录结果并写审计日志
 * @param req 请求对象
 * @param res 响应对象
 * @param result 登录结果
 * @param identifier 用于日志的账号标识（会脱敏）
 * @param channel 登录通道中文名
 */
function respondLogin(
  req: Request,
  res: Response,
  result: LoginOutcome,
  identifier: string,
  channel: string
): void {
  const traceId = req.traceId ?? '-';
  const ip = clientIp(req);
  const logName = `${channel}:${maskSingle(identifier)}`;

  if ('error' in result) {
    saveLoginLog({
      traceId,
      username: logName,
      ip,
      loginResult: result.error === 'USER_DISABLED' ? 'fail_user_disabled' : 'fail_external'
    });
    if (result.error === 'USER_DISABLED') {
      throw new HttpError(403, ErrorCodeEnum.FORBIDDEN.code, '账号已禁用');
    }
    throw new HttpError(401, ErrorCodeEnum.UNAUTHORIZED.code, result.error);
  }

  saveLoginLog({ traceId, username: logName, ip, loginResult: 'success' });
  res.json({ code: 0, message: 'ok', data: result });
}

// ========================== 登录方式状态 ==========================

/** GET /providers - 各登录方式当前模式（前端展示「演示模式」标识用） */
router.get('/providers', (_req: Request, res: Response) => {
  res.json({
    code: 0,
    message: 'ok',
    data: {
      password: { enabled: true, mode: 'local' },
      email: {
        enabled: true,
        mode: config.unified.email.provider,
        exposeCode: config.unified.email.exposeCode
      },
      phone: {
        enabled: true,
        mode: config.unified.phone.provider,
        exposeCode: config.unified.phone.exposeCode
      },
      wechat: { enabled: true, mode: config.unified.wechat.mock ? 'mock' : 'real' },
      sso: { enabled: true, ...getSsoConfig() },
      cert: { enabled: true, mode: config.unified.cert.mode }
    }
  });
});

// ========================== 邮件验证码 ==========================

/** POST /email/code - 发送邮箱验证码（mock 模式直接回传 devCode 供演示；smtp 模式真实发信） */
router.post('/email/code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body ?? {};
    if (!email || !isValidEmail(String(email))) {
      throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入正确的邮箱地址');
    }

    const result = await sendEmailCode(String(email));
    if ('error' in result) {
      // 发信失败按服务不可用处理，冷却中按请求过频处理
      const status = result.error.includes('邮件发送失败') ? 503 : 429;
      throw new HttpError(status, ErrorCodeEnum.INVALID_PARAM.code, result.error);
    }
    res.json({ code: 0, message: 'ok', data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /email/login - 邮箱验证码登录（首次登录自动建号） */
router.post('/email/login', (req: Request, res: Response) => {
  const { email, code } = req.body ?? {};
  if (!email || !isValidEmail(String(email))) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入正确的邮箱地址');
  }
  if (!code) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入邮箱验证码');
  }

  const normalized = normalizeEmail(String(email));
  if (!verifyEmailCode(normalized, String(code))) {
    saveLoginLog({
      traceId: req.traceId ?? '-',
      username: `邮箱:${maskSingle(normalized)}`,
      ip: clientIp(req),
      loginResult: 'fail_external'
    });
    throw new HttpError(401, ErrorCodeEnum.CAPTCHA_INVALID.code, '验证码错误或已过期，请重新获取');
  }

  respondLogin(req, res, loginByEmail(normalized), normalized, '邮箱');
});

// ========================== 手机号验证码 ==========================

/** POST /phone/code - 发送手机号验证码（mock 模式直接回传 devCode） */
router.post('/phone/code', async (req: Request, res: Response) => {
  const { phone } = req.body ?? {};
  if (!phone || !isValidPhone(String(phone))) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入正确的 11 位手机号');
  }
  const result = await sendPhoneCode(String(phone));
  if ('error' in result) {
    throw new HttpError(429, ErrorCodeEnum.INVALID_PARAM.code, result.error);
  }
  res.json({ code: 0, message: 'ok', data: result });
});

/** POST /phone/login - 手机号验证码登录（首次登录自动建号） */
router.post('/phone/login', (req: Request, res: Response) => {
  const { phone, code } = req.body ?? {};
  if (!phone || !isValidPhone(String(phone))) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入正确的 11 位手机号');
  }
  if (!code) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '请输入手机号验证码');
  }
  if (!verifyPhoneCode(String(phone), String(code))) {
    saveLoginLog({
      traceId: req.traceId ?? '-',
      username: `手机:${maskSingle(String(phone))}`,
      ip: clientIp(req),
      loginResult: 'fail_external'
    });
    throw new HttpError(401, ErrorCodeEnum.CAPTCHA_INVALID.code, '验证码错误或已过期，请重新获取');
  }
  respondLogin(req, res, loginByPhone(String(phone)), String(phone), '手机');
});

// ========================== 微信扫码（mock） ==========================

/** POST /wechat/qr - 创建扫码会话 */
router.post('/wechat/qr', (_req: Request, res: Response) => {
  res.json({ code: 0, message: 'ok', data: createWechatQr() });
});

/** GET /wechat/qr/:sceneId - 轮询扫码状态，确认后一次性返回 token */
router.get('/wechat/qr/:sceneId', (req: Request, res: Response) => {
  const result = getWechatQrStatus(req.params.sceneId);
  if (!result) {
    throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '二维码不存在或已过期，请刷新');
  }
  const { status, expiresIn, login } = result;
  res.json({
    code: 0,
    message: 'ok',
    data: login ? { status, expiresIn, ...login } : { status, expiresIn }
  });
});

/** POST /wechat/qr/:sceneId/mock-scan - 模拟手机扫码 */
router.post('/wechat/qr/:sceneId/mock-scan', (req: Request, res: Response) => {
  const ok = simulateWechatScan(req.params.sceneId);
  if (!ok) {
    throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '二维码已失效，请刷新后重试');
  }
  res.json({ code: 0, message: 'ok', data: { status: 'scanned' } });
});

/** POST /wechat/qr/:sceneId/mock-confirm - 模拟手机确认登录 */
router.post('/wechat/qr/:sceneId/mock-confirm', (req: Request, res: Response) => {
  const result = simulateWechatConfirm(req.params.sceneId);
  if (!result) {
    throw new HttpError(404, ErrorCodeEnum.NOT_FOUND.code, '二维码已失效，请刷新后重试');
  }
  if ('error' in result) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, result.error);
  }
  saveLoginLog({
    traceId: req.traceId ?? '-',
    username: `微信:${maskSingle(result.user.username)}`,
    ip: clientIp(req),
    loginResult: 'success'
  });
  res.json({ code: 0, message: 'ok', data: { status: 'confirmed' } });
});

// ========================== 统一认证平台（mock） ==========================

/** GET /sso/config - 统一认证入口配置 */
router.get('/sso/config', (_req: Request, res: Response) => {
  res.json({ code: 0, message: 'ok', data: getSsoConfig() });
});

/** POST /sso/mock-login - 模拟统一认证回调（ticket 可选） */
router.post('/sso/mock-login', (req: Request, res: Response) => {
  const { ticket } = req.body ?? {};
  const result = loginBySsoTicket(ticket ? String(ticket) : undefined);
  if ('error' in result) {
    throw new HttpError(503, ErrorCodeEnum.INTERNAL_ERROR.code, result.error);
  }
  respondLogin(req, res, result, result.user.username, '统一认证');
});

// ========================== 数字证书 ==========================

/** POST /cert/login - 上传证书文件并登录（mock：校验文件 + 计算指纹） */
router.post('/cert/login', certUpload.single('cert'), (req: Request, res: Response) => {
  if (!req.file) {
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, '未收到证书文件（字段名应为 cert）');
  }

  const outcome = loginByCertificate({
    originalname: req.file.originalname,
    size: req.file.size,
    buffer: req.file.buffer
  });

  if ('error' in outcome.login) {
    saveLoginLog({
      traceId: req.traceId ?? '-',
      username: `证书:${maskSingle(req.file.originalname)}`,
      ip: clientIp(req),
      loginResult: 'fail_external'
    });
    throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM.code, outcome.login.error);
  }

  respondLogin(req, res, outcome.login, req.file.originalname, '证书');
});

export default router;
