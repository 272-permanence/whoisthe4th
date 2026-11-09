/**
 * @file 图形验证码服务（进程内存储）
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 生成 4 位字符的 SVG 图形验证码，5 分钟有效、一次性校验。
 *              验证码只存内存，不落库，重启服务后全部失效（符合验证码语义）。
 */
import crypto from 'node:crypto';

/** 验证码有效期：5 分钟 */
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
/** 内存中最多保留的验证码数量，超过则清理过期项 */
const CAPTCHA_MAX_SIZE = 5000;
/** 字符集：去掉 0/O/1/I/l 等易混淆字符 */
const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** 验证码长度 */
const CODE_LENGTH = 4;

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

const store = new Map<string, CaptchaEntry>();

/** 清理已过期条目 */
function sweep(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

/** 生成随机验证码文本 */
function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CHARS[crypto.randomInt(0, CHARS.length)];
  }
  return out;
}

/** 生成带干扰线/噪点的 SVG 图片 */
function renderSvg(code: string): string {
  const width = 120;
  const height = 40;

  const texts = [...code]
    .map((ch, i) => {
      const x = 16 + i * 26;
      const y = 28;
      const rotate = crypto.randomInt(-18, 19);
      const color = `hsl(${crypto.randomInt(0, 360)}, 62%, 38%)`;
      const fontSize = 22 + crypto.randomInt(0, 5);
      return `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
    })
    .join('');

  const lines = Array.from({ length: 3 })
    .map(() => {
      const x1 = crypto.randomInt(0, width);
      const y1 = crypto.randomInt(0, height);
      const x2 = crypto.randomInt(0, width);
      const y2 = crypto.randomInt(0, height);
      const color = `hsl(${crypto.randomInt(0, 360)}, 45%, 55%)`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.55"/>`;
    })
    .join('');

  const dots = Array.from({ length: 24 })
    .map(() => {
      const cx = crypto.randomInt(0, width);
      const cy = crypto.randomInt(0, height);
      const r = crypto.randomInt(1, 3);
      const color = `hsl(${crypto.randomInt(0, 360)}, 50%, 60%)`;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.45"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f2f6f4"/>${lines}${dots}${texts}</svg>`;
}

/** 生成一个新的验证码 */
export function createCaptcha(): { captchaId: string; svg: string; expiresIn: number } {
  if (store.size > CAPTCHA_MAX_SIZE) sweep();
  const captchaId = crypto.randomUUID();
  const code = randomCode();
  store.set(captchaId, { code, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { captchaId, svg: renderSvg(code), expiresIn: Math.floor(CAPTCHA_TTL_MS / 1000) };
}

/**
 * 校验验证码（一次性：无论成功失败都会失效，防止暴力重试）
 * @param captchaId 验证码 ID
 * @param input 用户输入
 */
export function verifyCaptcha(captchaId: string, input: string): boolean {
  const entry = store.get(captchaId);
  if (!entry) return false;
  store.delete(captchaId);
  if (entry.expiresAt <= Date.now()) return false;
  return entry.code === String(input ?? '').trim().toUpperCase();
}
