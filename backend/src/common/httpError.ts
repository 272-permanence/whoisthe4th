/**
 * @file 公共层：业务异常类（re-export 自 utils/httpError.ts）
 * @description 控制器/服务层抛出 HttpError，由 app.ts 的统一错误中间件转换为响应体。
 *              原文件在 utils/httpError.ts，此处做一层聚合入口。
 */
export { HttpError } from '../utils/httpError.js';
