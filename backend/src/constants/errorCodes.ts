/**
 * @file 业务错误码常量（统一异常控制）
 * @author 第八组（成员C）
 * @date 2026-11-05
 * @description 对外 HTTP 接口统一返回错误码。每个错误码同时携带：
 *              - code：业务错误码数字，前后端契约用
 *              - msg：英文原始描述（服务端日志/排障用）
 *              - zhMsg：面向用户的中文提示（响应体对外展示用）
 *              调用方取数字请用 ErrorCodeEnum.X.code。
 */
export interface ErrorCodeItem {
  /** 业务错误码数字 */
  code: number;
  /** 英文原始描述 */
  msg: string;
  /** 面向用户的中文提示 */
  zhMsg: string;
}

export const ErrorCodeEnum = {
  /** 参数校验失败 */
  INVALID_PARAM: { code: 40001, msg: 'Invalid param', zhMsg: '参数不合法' },
  /** 上传文件缺失或类型不合法 */
  INVALID_AUDIO: { code: 40002, msg: 'Invalid audio file', zhMsg: '上传的音频文件缺失或格式不支持' },
  /** 上传文件超出体积上限 */
  PAYLOAD_TOO_LARGE: { code: 40003, msg: 'Payload too large', zhMsg: '上传文件超出体积上限' },
  /** 图形验证码错误或已过期 */
  CAPTCHA_INVALID: { code: 40004, msg: 'Invalid captcha', zhMsg: '验证码错误或已过期，请重新输入' },
  /** 未登录或缺少身份标识 */
  UNAUTHORIZED: { code: 40100, msg: 'Unauthorized', zhMsg: '您尚未登录或登录状态已失效，请重新登录' },
  /** 已登录但无该接口权限 */
  FORBIDDEN: { code: 40300, msg: 'Forbidden', zhMsg: '您没有权限执行该操作' },
  /** 访问的路由不存在 */
  NOT_FOUND: { code: 40400, msg: 'Resource not found', zhMsg: '您访问的资源不存在' },
  /** 未预期的服务端异常 */
  INTERNAL_ERROR: { code: 50000, msg: 'Internal server error', zhMsg: '服务器开小差了，请稍后重试' },
  /** 语音识别服务不可用 */
  ASR_FAILED: { code: 50001, msg: 'ASR failed', zhMsg: '语音识别服务暂时不可用' },
  /** 语音合成服务不可用 */
  TTS_FAILED: { code: 50002, msg: 'TTS failed', zhMsg: '语音合成服务暂时不可用' }
} as const;

/** 业务错误码数字类型（响应体 code 字段） */
export type ErrorCode = number;

/** 全部错误码项 */
export type ErrorCodeItemType = (typeof ErrorCodeEnum)[keyof typeof ErrorCodeEnum];

/** 错误码数字 → 错误码项 的索引 */
const CODE_INDEX: ReadonlyMap<number, ErrorCodeItemType> = new Map(
  Object.values(ErrorCodeEnum).map(item => [item.code, item])
);

/**
 * 按业务错误码数字查中文提示
 * @param code 业务错误码数字
 * @param fallback 未命中时的兜底中文提示
 */
export function getZhMsg(code: number, fallback = '操作失败，请稍后重试'): string {
  return CODE_INDEX.get(code)?.zhMsg ?? fallback;
}

/** 按业务错误码数字查完整错误码项 */
export function getErrorCodeItem(code: number): ErrorCodeItemType | undefined {
  return CODE_INDEX.get(code);
}
