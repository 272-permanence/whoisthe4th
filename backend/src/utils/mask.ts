/**
 * @file 敏感信息脱敏工具
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 日志/审计场景下对账号类敏感字段做脱敏，避免明文落库落盘。
 */

/**
 * 单值脱敏：保留首尾字符，中间用 * 替换
 * - 'admin'    → 'a***n'
 * - 'zhangsan' → 'z******n'
 * - 'ab'       → 'a*'
 * - 'a'        → '*'
 * @param value 原始字符串
 */
export function maskSingle(value: string): string {
  const text = String(value ?? '');
  const len = text.length;
  if (len <= 1) return '*';
  if (len === 2) return `${text[0]}*`;
  return `${text[0]}${'*'.repeat(len - 2)}${text[len - 1]}`;
}
