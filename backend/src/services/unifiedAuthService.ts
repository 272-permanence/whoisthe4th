/**
 * @file 统一身份认证服务（邮件验证码 / 微信扫码 / 统一认证平台 / 数字证书）
 * @author 第八组（成员C）
 * @date 2026-11-10
 * @description 课程演示版实现：
 *              - 默认全部为 mock 模式，不依赖任何真实外部资质
 *              - 邮件通道已接入真实 SMTP（EMAIL_PROVIDER=smtp + 授权码即启用）
 *              - 验证码 / 二维码会话存在进程内存，重启即失效（演示足够）
 *              - 微信 / 统一认证 / 证书的真实对接位置已在 config.unified 中预留开关
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { loginByExternal, type SafeUser } from './authService.js';
import { sendLoginCodeMail } from './mailService.js';

export interface LoginPayload {
  user: SafeUser;
  token: string;
}

export type LoginOutcome = LoginPayload | { error: string };

// ========================== 邮件验证码 ==========================

interface EmailCodeRecord {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

/** email → 验证码记录 */
const emailCodes = new Map<string, EmailCodeRecord>();

/** 邮箱统一小写，避免大小写导致的两个账号 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 邮箱格式校验 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 生成并「发送」邮箱验证码
 * @param email 收件邮箱
 */
export async function sendEmailCode(
  email: string
): Promise<{ expiresIn: number; cooldownSec: number; mock: boolean; devCode?: string } | { error: string }> {
  const key = normalizeEmail(email);
  const now = Date.now();
  const prev = emailCodes.get(key);

  // 60 秒内只允许发一次，防止刷接口
  if (prev && now - prev.lastSentAt < config.unified.email.cooldownSec * 1000) {
    const wait = Math.ceil((config.unified.email.cooldownSec * 1000 - (now - prev.lastSentAt)) / 1000);
    return { error: `发送过于频繁，请 ${wait} 秒后再试` };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ttlSec = config.unified.email.codeTtlSec;
  emailCodes.set(key, { code, expiresAt: now + ttlSec * 1000, lastSentAt: now });

  const mock = config.unified.email.provider === 'mock';

  // 真实 SMTP 分支：nodemailer 发信，验证码不下发给前端
  if (!mock) {
    try {
      await sendLoginCodeMail(key, code, Math.round(ttlSec / 60));
    } catch (err) {
      // 发送失败不占用冷却时间，允许用户立刻重试
      emailCodes.delete(key);
      console.error('[unified-auth] 邮件发送失败:', err);
      return { error: '邮件发送失败，请检查后端 SMTP 配置（QQ 邮箱需使用授权码）' };
    }
  }

  return {
    expiresIn: ttlSec,
    cooldownSec: config.unified.email.cooldownSec,
    mock,
    devCode: mock && config.unified.email.exposeCode ? code : undefined
  };
}

/**
 * 校验邮箱验证码（一次性，校验通过后立即失效）
 * @param email 邮箱
 * @param code 用户输入的 6 位验证码
 */
export function verifyEmailCode(email: string, code: string): boolean {
  const key = normalizeEmail(email);
  const record = emailCodes.get(key);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    emailCodes.delete(key);
    return false;
  }
  if (record.code !== code.trim()) return false;
  emailCodes.delete(key);
  return true;
}

/** 邮箱验证码登录：首次登录自动建号 */
export function loginByEmail(email: string): LoginOutcome {
  const key = normalizeEmail(email);
  return loginByExternal('email', key, key.split('@')[0]);
}

// ========================== 手机号验证码 ==========================

interface PhoneCodeRecord {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

/** 手机号 → 验证码记录 */
const phoneCodes = new Map<string, PhoneCodeRecord>();

/** 大陆手机号：11 位，1 开头，第二位 3-9 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim());
}

/**
 * 生成并「发送」手机号验证码（mock：直接返回前端；sms：真实对接阿里云/腾讯云 SMS）
 */
export async function sendPhoneCode(
  phone: string
): Promise<{ expiresIn: number; cooldownSec: number; mock: boolean; devCode?: string } | { error: string }> {
  const key = phone.trim();
  const now = Date.now();
  const prev = phoneCodes.get(key);

  if (prev && now - prev.lastSentAt < config.unified.phone.cooldownSec * 1000) {
    const wait = Math.ceil((config.unified.phone.cooldownSec * 1000 - (now - prev.lastSentAt)) / 1000);
    return { error: `发送过于频繁，请 ${wait} 秒后再试` };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ttlSec = config.unified.phone.codeTtlSec;
  phoneCodes.set(key, { code, expiresAt: now + ttlSec * 1000, lastSentAt: now });

  const mock = config.unified.phone.provider === 'mock';

  // 真实 SMS 对接点（mock 跳过）：阿里云 dysmsapi / 腾讯云 sms 发信
  if (!mock) {
    phoneCodes.delete(key); // 真实短信发不出去就不占用冷却
    return { error: '真实短信发送尚未对接，请在后端接入阿里云/腾讯云 SMS 后再试' };
  }

  return {
    expiresIn: ttlSec,
    cooldownSec: config.unified.phone.cooldownSec,
    mock,
    devCode: mock && config.unified.phone.exposeCode ? code : undefined
  };
}

/** 校验手机号验证码（一次性消费） */
export function verifyPhoneCode(phone: string, code: string): boolean {
  const key = phone.trim();
  const record = phoneCodes.get(key);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    phoneCodes.delete(key);
    return false;
  }
  if (record.code !== code.trim()) return false;
  phoneCodes.delete(key);
  return true;
}

/** 手机号验证码登录：首次登录自动建号 */
export function loginByPhone(phone: string): LoginOutcome {
  return loginByExternal('phone', phone.trim(), `手机用户${phone.trim().slice(-4)}`);
}

// ========================== 微信扫码（mock） ==========================

export type QrStatus = 'pending' | 'scanned' | 'confirmed' | 'expired';

interface QrSession {
  status: QrStatus;
  createdAt: number;
  expiresAt: number;
  /** 扫码确认后一次性返回给轮询接口，取走后清空，避免 token 被重复领取 */
  login?: LoginPayload;
}

const qrSessions = new Map<string, QrSession>();

/** mock 微信身份：固定 openid，保证多次演示登录到同一个账号 */
const MOCK_WECHAT_OPENID = 'mock_wechat_openid_001';
const MOCK_WECHAT_NICKNAME = '微信用户';

/**
 * 创建扫码会话
 * @returns sceneId 供前端轮询；qrText 为二维码内容（mock 下不可真实扫描）
 */
export function createWechatQr(): { sceneId: string; qrText: string; expiresIn: number; mock: boolean } {
  const sceneId = `qr_${crypto.randomBytes(8).toString('hex')}`;
  const now = Date.now();
  qrSessions.set(sceneId, {
    status: 'pending',
    createdAt: now,
    expiresAt: now + config.unified.wechat.qrTtlSec * 1000
  });
  return {
    sceneId,
    qrText: `https://open.weixin.qq.com/connect/qrconnect?appid=${config.unified.wechat.appId || 'mock'}&state=${sceneId}`,
    expiresIn: config.unified.wechat.qrTtlSec,
    mock: config.unified.wechat.mock
  };
}

/** 取会话，过期自动标记 */
function getSession(sceneId: string): QrSession | null {
  const session = qrSessions.get(sceneId);
  if (!session) return null;
  if (session.status !== 'confirmed' && Date.now() > session.expiresAt) {
    session.status = 'expired';
  }
  return session;
}

/**
 * 轮询扫码状态
 * @param sceneId 扫码会话 ID
 */
export function getWechatQrStatus(
  sceneId: string
): { status: QrStatus; expiresIn: number; login?: LoginPayload } | null {
  const session = getSession(sceneId);
  if (!session) return null;
  const expiresIn = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
  if (session.status === 'confirmed' && session.login) {
    const login = session.login;
    // 一次性领取，防止前端重复拿到 token
    session.login = undefined;
    return { status: 'confirmed', expiresIn, login };
  }
  return { status: session.status, expiresIn };
}

/** 模拟「手机已扫码」 */
export function simulateWechatScan(sceneId: string): boolean {
  const session = getSession(sceneId);
  if (!session || session.status !== 'pending') return false;
  session.status = 'scanned';
  return true;
}

/** 模拟「手机确认登录」：生成登录态挂在会话上，等前端轮询领取 */
export function simulateWechatConfirm(sceneId: string): LoginOutcome | null {
  const session = getSession(sceneId);
  if (!session) return null;
  if (session.status === 'expired' || session.status === 'confirmed') return { error: '二维码已失效，请刷新' };
  const result = loginByExternal('wechat', MOCK_WECHAT_OPENID, MOCK_WECHAT_NICKNAME);
  if ('error' in result) return result;
  session.status = 'confirmed';
  session.login = result;
  return result;
}

// ========================== 统一认证平台（mock） ==========================

/** mock 统一认证身份：固定学号，保证演示账号稳定 */
const MOCK_SSO_UID = 'sso_20260001';
const MOCK_SSO_NICKNAME = '统一认证用户';

/** 统一认证入口信息（前端据此渲染跳转按钮） */
export function getSsoConfig(): { mode: 'mock' | 'real'; url: string; clientId: string } {
  const mode = config.unified.sso.mode;
  const url =
    mode === 'real' && config.unified.sso.endpoint
      ? `${config.unified.sso.endpoint}?client_id=${encodeURIComponent(config.unified.sso.clientId)}&response_type=code`
      : 'mock://unified-auth/mock-login';
  return { mode, url, clientId: config.unified.sso.clientId };
}

/**
 * 统一认证票据换登录态
 * @param ticket 认证平台回调带回的票据（mock 模式可省略）
 */
export function loginBySsoTicket(ticket?: string): LoginOutcome {
  if (config.unified.sso.mode === 'real') {
    // 真实对接点：调用 SSO_ENDPOINT 校验 ticket，换取学号/工号
    return { error: '统一认证平台尚未配置，请在后端接入真实票据校验' };
  }
  const uid = ticket?.trim() || MOCK_SSO_UID;
  return loginByExternal('sso', uid, MOCK_SSO_NICKNAME);
}

// ========================== 数字证书登录（mock） ==========================

/**
 * 校验证书并登录
 * @param file 用户上传的证书文件（内存态）
 * @returns 证书指纹与登录结果
 */
export function loginByCertificate(file: {
  originalname: string;
  size: number;
  buffer: Buffer;
}): { fingerprint: string; mock: boolean; login: LoginOutcome } {
  // mock 校验：文件可读 + 非空 + 扩展名合法
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  const allowed = ['cer', 'crt', 'pem', 'pfx', 'p12'];
  if (file.size <= 0 || !allowed.includes(ext)) {
    return {
      fingerprint: '',
      mock: true,
      login: { error: '证书文件无效，请上传 .cer / .crt / .pem / .pfx 格式的证书' }
    };
  }

  // 真实对接点：CERT_MODE=ca 时用 CA_CERT_PATH 做 X.509 验签与有效期校验
  const fingerprint = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const nickname = file.originalname.replace(/\.[^.]+$/, '').slice(0, 32) || '证书用户';
  return {
    fingerprint,
    mock: config.unified.cert.mode === 'mock',
    login: loginByExternal('cert', fingerprint, nickname)
  };
}
