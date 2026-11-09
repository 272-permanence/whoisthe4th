/**
 * @file 客户端 IP 解析工具
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 兼容反向代理场景：优先取 X-Forwarded-For 首个地址，其次 req.ip / socket 地址。
 */
import type { Request } from 'express';

/**
 * 取客户端真实 IP
 * @param req Express 请求对象
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (first) return first.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
