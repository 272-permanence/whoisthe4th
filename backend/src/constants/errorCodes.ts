/**
 * @file 业务错误码常量
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 对外 HTTP 接口统一返回错误码，便于前端做统一提示。
 */
export const ErrorCodeEnum = {
  /** 参数校验失败 */
  INVALID_PARAM: 40001,
  /** 上传文件缺失或类型不合法 */
  INVALID_AUDIO: 40002,
  /** 上传文件超出体积上限 */
  PAYLOAD_TOO_LARGE: 40003,

  // ---- 认证授权（成员C） ----
  /** 未登录 / Token 缺失或过期 */
  UNAUTHORIZED: 40101,
  /** 无权限访问（角色不足） */
  FORBIDDEN: 40301,
  /** 用户名已存在 */
  USERNAME_EXISTS: 40901,
  /** 用户名或密码错误 */
  BAD_CREDENTIALS: 40102,

  /** 语音识别服务不可用 */
  ASR_FAILED: 50001,
  /** 语音合成服务不可用 */
  TTS_FAILED: 50002,
  /** 未预期的服务端异常 */
  INTERNAL_ERROR: 50000
} as const;

export type ErrorCode = (typeof ErrorCodeEnum)[keyof typeof ErrorCodeEnum];
