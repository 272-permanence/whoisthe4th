/**
 * @file 公共层：业务错误码（re-export 自 constants/errorCodes.ts）
 * @description 所有后端模块应从 common/ 引用错误码，避免散落的裸数字。
 *              原文件在 constants/errorCodes.ts，此处做一层聚合入口。
 */
export { ErrorCodeEnum } from '../constants/errorCodes.js';
export type { ErrorCode } from '../constants/errorCodes.js';
