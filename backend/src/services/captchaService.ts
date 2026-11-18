/**
 * @file 图形验证码服务（防止暴力撞库）
 * @description 验证码在密码校验之前执行，一次性消费（verify 成功后立即 delete）
 */
import crypto from 'node:crypto';

const captchas = new Map<string, { code: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000; // 5 分钟过期

function rand4(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, '0');
}

export interface CaptchaResult {
  captchaId: string;
  svg: string;
}

/** 生成一个 4 位数字验证码 + SVG 图 */
export function generateCaptcha(): CaptchaResult {
  const id = crypto.randomUUID();
  const code = rand4();
  captchas.set(id, { code, expiresAt: Date.now() + TTL_MS });

  // 简易 SVG 验证码：4 位数字 + 干扰线
  const w = 120, h = 40;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  svg += `<rect width="${w}" height="${h}" fill="#f0fdfa"/>`;
  // 干扰线
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(0, w), y1 = crypto.randomInt(0, h);
    const x2 = crypto.randomInt(0, w), y2 = crypto.randomInt(0, h);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5eead4" stroke-width="1"/>`;
  }
  // 验证码数字
  for (let i = 0; i < 4; i++) {
    const x = 18 + i * 25;
    const y = 28 + crypto.randomInt(-3, 3);
    const deg = crypto.randomInt(-20, 20);
    svg += `<text x="${x}" y="${y}" font-size="22" font-family="monospace" font-weight="bold" fill="#0f766e" transform="rotate(${deg} ${x} ${y})">${code[i]}</text>`;
  }
  svg += `</svg>`;
  return { captchaId: id, svg };
}

/**
 * 校验验证码（一次性消费）
 * @returns true = 正确（同时删除），false = 错误或过期
 */
export function verifyCaptcha(captchaId: string, captchaCode: string): boolean {
  const entry = captchas.get(captchaId);
  if (!entry) return false;
  captchas.delete(captchaId); // 无论对错都删除，防止重放
  if (entry.expiresAt < Date.now()) return false;
  return entry.code === String(captchaCode).trim();
}

/** 清理过期验证码（可定时调用） */
export function cleanupExpiredCaptchas(): void {
  const now = Date.now();
  for (const [id, v] of captchas) {
    if (v.expiresAt < now) captchas.delete(id);
  }
}
