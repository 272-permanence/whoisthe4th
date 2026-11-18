/**
 * @file 统一身份认证服务（6 通道：邮箱 / 手机 / 微信 / SSO / 证书 + 密码由 authService 承担）
 * @description 配置驱动的 mock/real 双模式：
 *              - mock 零成本演示，验证码直接 devCode 回传前端
 *              - real 模式改 .env 即切换，业务代码不动
 *              - 真实 SMS/SMTP 发送失败不占冷却时间
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { loginByExternal, type ExternalProvider, type SafeUser, signToken } from './authService.js';

// ============= 验证码存储（进程内存，演示够用） =============
interface CodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}
const emailCodes = new Map<string, CodeEntry>();
const phoneCodes = new Map<string, CodeEntry>();

function rand6(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function validateCooldown(map: Map<string, CodeEntry>, key: string, cooldownSec: number): void {
  const prev = map.get(key);
  if (prev && Date.now() - prev.lastSentAt < cooldownSec * 1000) {
    const wait = Math.ceil((cooldownSec * 1000 - (Date.now() - prev.lastSentAt)) / 1000);
    const err = new Error(`发送过于频繁，请 ${wait} 秒后再试`);
    (err as any).status = 429;
    throw err;
  }
}

// ============= 阿里云 SMS 客户端（懒加载） =============
let aliyunClient: any = null;
let dysmsNS: any = null;
async function getAliyunClient() {
  if (aliyunClient) return { client: aliyunClient, ns: dysmsNS };
  const DysmsMod: any = await import('@alicloud/dysmsapi20170525');
  const OpenApiMod: any = await import('@alicloud/openapi-client');
  const sms = config.unified.phone;
  // ESM 下 SDK 是 CJS 包装 —— DysmsMod.default.default 才是 Client 构造函数
  const cliCtor = (DysmsMod as any).default?.default ?? (DysmsMod as any).default;
  if (typeof cliCtor !== 'function') throw new Error(`阿里云 SMS SDK Client 构造函数未找到，实际 default.default 类型: ${typeof cliCtor}`);
  const OpenApiNS = OpenApiMod;
  const cfg = new OpenApiNS.Config({ accessKeyId: sms.accessKeyId, accessKeySecret: sms.accessKeySecret, endpoint: 'dysmsapi.aliyuncs.com' });
  aliyunClient = new cliCtor(cfg);
  dysmsNS = DysmsMod;
  return { client: aliyunClient, ns: dysmsNS };
}

// ============= SMTP（懒加载 nodemailer） =============
let nodemailerMod: any = null;
async function getNodemailer() {
  if (!nodemailerMod) nodemailerMod = await import('nodemailer');
  return nodemailerMod;
}

// ==================== 邮箱验证码 ====================

export async function sendEmailCode(email: string): Promise<{ expiresIn: number; cooldownSec: number; mock: boolean; devCode?: string }> {
  const emailCfg = config.unified.email;
  const ttlSec = emailCfg.codeTtlSec;
  validateCooldown(emailCodes, email, emailCfg.cooldownSec);

  const code = rand6();
  emailCodes.set(email, { code, expiresAt: Date.now() + ttlSec * 1000, lastSentAt: Date.now() });

  const mock = emailCfg.provider === 'mock';
  if (mock) {
    const result: any = { expiresIn: ttlSec, cooldownSec: emailCfg.cooldownSec, mock: true };
    if (emailCfg.exposeCode) result.devCode = code;
    return result;
  }

  // 真实 SMTP
  try {
    if (!emailCfg.smtpUser || !emailCfg.smtpPass) {
      emailCodes.delete(email);
      throw new Error('SMTP 配置缺失');
    }
    const nodemailer = await getNodemailer();
    const transporter = nodemailer.createTransport({
      host: emailCfg.smtpHost, port: emailCfg.smtpPort, secure: emailCfg.smtpSecure,
      auth: { user: emailCfg.smtpUser, pass: emailCfg.smtpPass }
    });
    await transporter.sendMail({
      from: emailCfg.smtpFrom || emailCfg.smtpUser,
      to: email,
      subject: '【景区AI】您的验证码',
      text: `您的验证码为 ${code}，${ttlSec / 60} 分钟内有效。`
    });
    return { expiresIn: ttlSec, cooldownSec: emailCfg.cooldownSec, mock: false };
  } catch (e) {
    emailCodes.delete(email);
    throw new Error(`邮件发送失败：${(e as Error).message}`);
  }
}

export function verifyEmailCode(email: string, code: string): boolean {
  const entry = emailCodes.get(email);
  if (!entry || entry.expiresAt < Date.now()) return false;
  emailCodes.delete(email);
  return entry.code === code.trim();
}

// ==================== 手机号验证码 ====================

export async function sendPhoneCode(phone: string): Promise<{ expiresIn: number; cooldownSec: number; mock: boolean; devCode?: string }> {
  const phoneCfg = config.unified.phone;
  const ttlSec = phoneCfg.codeTtlSec;
  validateCooldown(phoneCodes, phone, phoneCfg.cooldownSec);

  const code = rand6();
  phoneCodes.set(phone, { code, expiresAt: Date.now() + ttlSec * 1000, lastSentAt: Date.now() });

  const mock = phoneCfg.provider === 'mock';
  if (mock) {
    const result: any = { expiresIn: ttlSec, cooldownSec: phoneCfg.cooldownSec, mock: true };
    if (phoneCfg.exposeCode) result.devCode = code;
    return result;
  }

  // 真实阿里云 SMS
  if (!phoneCfg.accessKeyId || !phoneCfg.accessKeySecret || !phoneCfg.signName || !phoneCfg.templateCode) {
    phoneCodes.delete(phone);
    throw new Error('阿里云 SMS 配置缺失，请检查 .env');
  }

  try {
    const { client, ns } = await getAliyunClient();
    const SendSmsRequest = ns.SendSmsRequest;
    const response: any = await client.sendSms(
      new SendSmsRequest({
        phoneNumbers: phone, signName: phoneCfg.signName,
        templateCode: phoneCfg.templateCode, templateParam: JSON.stringify({ code })
      })
    );
    const body = response?.body ?? response?.data ?? {};
    // 阿里云新版 SDK 返回小写 code/message，老版返回大写 Code/Message
    const aliCode: string = body?.code ?? body?.Code ?? 'UNKNOWN';

    if (aliCode === 'OK') return { expiresIn: ttlSec, cooldownSec: phoneCfg.cooldownSec, mock: false };

    if (aliCode === 'isv.BUSINESS_LIMIT_CONTROL') {
      // 限流 —— 保留冷却，让用户等
      const wait = Math.ceil((phoneCfg.cooldownSec * 1000 - (Date.now() - (phoneCodes.get(phone)?.lastSentAt ?? 0))) / 1000);
      throw Object.assign(new Error(`短信发送过于频繁，请 ${Math.max(wait, phoneCfg.cooldownSec)} 秒后再试`), { status: 429 });
    }

    // 其他错误 —— 不占冷却，允许重试
    phoneCodes.delete(phone);
    const hint = body?.message ?? body?.Message ?? aliCode;
    throw new Error(`短信发送失败（${aliCode}）：${hint}`);
  } catch (e: any) {
    if (e.status === 429) throw e;
    phoneCodes.delete(phone);
    throw new Error(`短信发送异常：${e?.message ?? '网络或服务错误'}`);
  }
}

export function verifyPhoneCode(phone: string, code: string): boolean {
  const entry = phoneCodes.get(phone);
  if (!entry || entry.expiresAt < Date.now()) return false;
  phoneCodes.delete(phone);
  return entry.code === code.trim();
}

// ==================== SSO（mock 固定学号） ====================

export function loginBySsoTicket(_ticket?: string): { user: SafeUser; token: string } {
  const mockUid = config.unified.sso.mockUid;
  const r = loginByExternal('sso', mockUid, '统一认证用户');
  if ('error' in r) throw new Error(r.error);
  return r;
}

// ==================== 微信扫码（mock） ====================

interface WechatQrEntry {
  sceneId: string;
  status: 'pending' | 'scanned' | 'confirmed' | 'expired';
  expiresAt: number;
}
const wechatQrs = new Map<string, WechatQrEntry>();

export function createWechatQr(): { sceneId: string; expiresIn: number } {
  const sceneId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const expireSec = config.unified.wechat.mockQrExpireSec;
  wechatQrs.set(sceneId, { sceneId, status: 'pending', expiresAt: Date.now() + expireSec * 1000 });
  // 自动过期
  setTimeout(() => {
    const q = wechatQrs.get(sceneId);
    if (q && q.status !== 'confirmed') { q.status = 'expired'; }
  }, expireSec * 1000);
  return { sceneId, expiresIn: expireSec };
}

export function pollWechatQr(sceneId: string): { status: string; user?: SafeUser; token?: string } {
  const q = wechatQrs.get(sceneId);
  if (!q) return { status: 'expired' };
  if (q.expiresAt < Date.now()) q.status = 'expired';
  if (q.status === 'confirmed') {
    const login = loginByExternal('wechat', sceneId, '微信用户');
    if ('error' in login) return { status: 'error' };
    wechatQrs.delete(sceneId);
    return { status: 'confirmed', user: login.user, token: login.token };
  }
  return { status: q.status };
}

export function mockWechatScan(sceneId: string): void {
  const q = wechatQrs.get(sceneId);
  if (q && q.status === 'pending') q.status = 'scanned';
}

export function mockWechatConfirm(sceneId: string): void {
  const q = wechatQrs.get(sceneId);
  if (q && q.status === 'scanned') q.status = 'confirmed';
}

// ==================== 数字证书（mock：算 SHA256 指纹做唯一标识） ====================

export function loginByCert(buf: Buffer): { user: SafeUser; token: string } {
  if (buf.length > config.unified.cert.maxFileBytes) throw new Error('证书文件超过 2MB');
  const fp = crypto.createHash('sha256').update(buf).digest('hex');
  const r = loginByExternal('cert', fp, '证书用户');
  if ('error' in r) throw new Error(r.error);
  return r;
}

// ==================== Providers 状态（前端据此显示「演示模式」标识） ====================

export interface ProviderStatusData {
  password: { enabled: boolean; mode: string };
  email: { enabled: boolean; mode: string; exposeCode: boolean };
  phone: { enabled: boolean; mode: string; exposeCode: boolean };
  wechat: { enabled: boolean; mode: string };
  sso: { enabled: boolean; mode: string; url: string; clientId: string };
  cert: { enabled: boolean; mode: string };
}

export function getProvidersStatus(): ProviderStatusData {
  return {
    password: { enabled: true, mode: 'local' },
    email: { enabled: true, mode: config.unified.email.provider, exposeCode: config.unified.email.exposeCode },
    phone: { enabled: true, mode: config.unified.phone.provider, exposeCode: config.unified.phone.exposeCode },
    wechat: { enabled: true, mode: config.unified.wechat.mode },
    sso: { enabled: true, mode: config.unified.sso.mode, url: config.unified.sso.endpoint || 'mock://unified-auth/mock-login', clientId: config.unified.sso.clientId },
    cert: { enabled: true, mode: config.unified.cert.mode }
  };
}
