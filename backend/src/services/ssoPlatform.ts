/**
 * @file SSO 模拟平台：模拟 CAS 协议的完整票据流程
 * @description 同后端独立路由组 `/sso-platform/`，提供真实 SSO 跳转 + ticket 颁发 + ticket 消费
 *
 * 完整流程：
 *   1. 主系统 → GET /sso-platform/login?service=xxx     （跳转登录页）
 *   2. SSO 登录页 → POST /sso-platform/login             （提交学号密码）
 *   3. SSO 校验 → 生成 ticket → 302 跳回 service?ticket=
 *   4. 主系统回调 → POST /api/v1/auth/sso/consume { ticket }  （消费票据换登录态）
 */
import crypto from 'node:crypto';

/** 模拟"学校统一认证用户池"（真实 CAS 对接时替换成 HTTP 调 CAS /serviceValidate） */
interface SsoAccount {
  sid: string;         // 学号/工号（SSO 唯一标识）
  password: string;    // 密码（demo 明文，生产用 bcrypt）
  nickname: string;
  org?: string;        // 学校/院系
}

// 预设 3 个学号，演示够用
const SSO_ACCOUNTS: SsoAccount[] = [
  { sid: 'sso_20260001', password: 'Abc@1234', nickname: '张三', org: '计算机学院' },
  { sid: 'sso_20260002', password: 'Abc@1234', nickname: '李四', org: '外国语学院' },
  { sid: 'sso_20260003', password: 'Abc@1234', nickname: '王五', org: '经济管理学院' },
];

/** 票据存储：ticket → 对应学号 + 过期时间 + 是否已消费 */
interface TicketEntry {
  ticket: string;
  sid: string;
  nickname: string;
  org?: string;
  service: string;
  expiresAt: number;
  consumed: boolean;
}

const tickets = new Map<string, TicketEntry>();
const TICKET_TTL_SEC = 30; // CAS ticket 通常一次性 + 短时效

function cleanExpired() {
  const now = Date.now();
  for (const [t, v] of tickets) if (v.expiresAt < now) tickets.delete(t);
}

/** 生成 ticket（ST-前缀 + 32 位随机） */
function randTicket(): string {
  return `ST-${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * 校验 SSO 账号密码（对应真实场景的 CAS /login）
 * @returns 成功返回账号对象，失败返回 null
 */
export function authenticate(sid: string, password: string): SsoAccount | null {
  const acc = SSO_ACCOUNTS.find(a => a.sid === sid.trim());
  if (!acc) return null;
  // demo 明文比较（真实对接时 CAS 会返回 TGT cookie，不需要我们验密码）
  return acc.password === password ? acc : null;
}

/**
 * 颁发 ticket（对应真实场景 CAS 登录成功后颁发 ST）
 * @param service 回调地址（前端）
 * @param sid 已认证的学号
 */
export function issueTicket(service: string, sid: string): TicketEntry {
  cleanExpired();
  const acc = SSO_ACCOUNTS.find(a => a.sid === sid)!;
  let ticket = randTicket();
  // 确保唯一
  while (tickets.has(ticket)) ticket = randTicket();
  const entry: TicketEntry = {
    ticket, sid: acc.sid, nickname: acc.nickname, org: acc.org,
    service, expiresAt: Date.now() + TICKET_TTL_SEC * 1000, consumed: false
  };
  tickets.set(ticket, entry);
  return entry;
}

/**
 * 消费 ticket（对应真实场景 CAS /serviceValidate）
 * - 一次性消费：成功后立即标记 consumed=true，同一 ticket 不能用两次
 * - 短时效：30 秒内必须消费
 */
export function consumeTicket(ticket: string): Omit<TicketEntry, 'ticket' | 'consumed'> | null {
  cleanExpired();
  const entry = tickets.get(ticket);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { tickets.delete(ticket); return null; }
  if (entry.consumed) { tickets.delete(ticket); return null; }
  entry.consumed = true;
  const { ticket: _t, consumed: _c, ...rest } = entry;
  tickets.delete(ticket);
  return rest;
}

/** 内部工具：获取所有 SSO 账号（登录页下拉框用） */
export function listAccounts(): Omit<SsoAccount, 'password'>[] {
  return SSO_ACCOUNTS.map(({ password, ...rest }) => rest);
}
