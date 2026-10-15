/**
 * @file 业务异常类
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 携带 HTTP 状态码与业务错误码的异常，由统一错误中间件转换成响应体。
 */
import { type ErrorCode } from '../constants/errorCodes.js';

export class HttpError extends Error {
  /** HTTP 状态码 */
  public readonly status: number;

  /** 业务错误码 */
  public readonly code: ErrorCode;

  /**
   * @param status HTTP 状态码
   * @param code 业务错误码
   * @param message 面向用户的错误描述
   */
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
