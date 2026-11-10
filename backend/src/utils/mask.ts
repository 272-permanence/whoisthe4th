/**
 * @file 敏感信息脱敏工具（B 专属，全组共用）
 * @description 统一脱敏策略：对包含敏感关键词的字段名进行遮盖，
 *              脱敏后的内容**绝对无法还原**，禁止在任何日志/接口/调试输出中出现明文。
 * @author 第八组（成员B）
 * @date 2026-11-09
 */

/** 敏感字段名关键词（小写匹配，出现在 key 里即触发脱敏） */
export const SENSITIVE_KEYS = [
  'password',    // 密码
  'token',       // JWT / 访问令牌
  'refresh',     // refresh token
  'secret',      // 密钥
  'mobile',      // 手机号
  'phone',       // 电话号码
  'tel',         // 电话
  'card',        // 银行卡号
  'bank',        // 银行相关
  'id_number',   // 身份证号
  'idno',        // 身份证号变体
  'credit',      // 信用卡
  'email',       // 邮箱（可选，如需脱敏请加）
  'authorization', // 请求头里的 Bearer token
  'cookie',      // Cookie 整体脱敏
  'apikey',      // API Key
  'signature',   // 签名
  'wx',          // 微信 openid 等
  'openid',      // 微信 openid
  'unionid',     // 微信 unionid
  'address'      // 详细地址（隐私）
] as const;

/**
 * 判断字段名是否包含敏感关键词（大小写不敏感）
 * @param key 字段名
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

/**
 * 单个字符串脱敏：保留前 keepStart 位 + 保留后 keepEnd 位，中间用 *** 填充
 * @param value 原始字符串，undefined/null 直接返回空串
 * @param keepStart 开头保留位数
 * @param keepEnd 结尾保留位数
 * @example maskSingle('18912345678') → '18***5678'
 * @example maskSingle('password123') → 'pa***23'
 * @example maskSingle('138') → '***'（太短直接全遮）
 */
export function maskSingle(
  value: string | undefined | null,
  keepStart: number = 2,
  keepEnd: number = 2
): string {
  if (!value || typeof value !== 'string') return '';
  // 长度不够保留，直接全遮
  if (value.length <= keepStart + keepEnd) return '***';
  return value.slice(0, keepStart) + '***' + value.slice(-keepEnd);
}

/**
 * 邮箱脱敏：保留 @ 前第一位和域名
 * @param email 原始邮箱
 * @example maskEmail('zhangsan@example.com') → 'z****@example.com'
 */
export function maskEmail(email: string | undefined | null): string {
  if (!email || typeof email !== 'string') return '';
  const atIndex = email.indexOf('@');
  if (atIndex <= 1) return '***';
  return email[0] + '****' + email.slice(atIndex);
}

/**
 * 手机号脱敏：保留前 3 位和后 4 位
 * @param mobile 原始手机号
 * @example maskMobile('18912345678') → '189****5678'
 */
export function maskMobile(mobile: string | undefined | null): string {
  if (!mobile || typeof mobile !== 'string') return '';
  if (mobile.length < 7) return '***';
  return mobile.slice(0, 3) + '****' + mobile.slice(-4);
}

/**
 * 对象脱敏：递归遍历所有 key，敏感字段自动遮盖，非敏感字段保留
 * @param params 原始对象（支持嵌套），string/null/undefined 等基本类型直接原样返回
 * @returns 脱敏后的对象（**新对象，不修改原对象**）
 *
 * 使用场景：
 * - B 的操作日志中间件：自动脱敏 req.body / req.query
 * - C 的登录日志：脱敏 username / password
 * - D 的日志查询接口：返回日志时再脱敏一次
 */
export function maskParams(params: unknown): unknown {
  // 基本类型：原样返回
  if (params === null || params === undefined || typeof params !== 'object') {
    return params;
  }

  // 数组：递归处理每个元素
  if (Array.isArray(params)) {
    return params.map((item) => maskParams(item));
  }

  // 对象：遍历每个 key，敏感字段脱敏，非敏感字段递归
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      // 敏感字段：根据 key 类型选择脱敏策略
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'string') {
        if (key.toLowerCase().includes('email')) {
          result[key] = maskEmail(value);
        } else if (key.toLowerCase().includes('mobile') || key.toLowerCase().includes('phone')) {
          result[key] = maskMobile(value);
        } else {
          result[key] = maskSingle(value);
        }
      } else {
        // 非字符串的敏感字段（比如 object/array 形式的 token），直接遮
        result[key] = '***';
      }
    } else {
      // 非敏感字段：递归处理（可能嵌套对象/数组）
      result[key] = maskParams(value);
    }
  }
  return result;
}

/**
 * HTTP 请求头脱敏（operationLog 中间件专用）
 * @param headers 原始请求头对象
 */
export function maskHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return maskParams(headers) as Record<string, unknown>;
}
