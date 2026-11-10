/**
 * @file 应用入口：中间件注册、路由挂载、统一错误处理
 * @author 第八组
 * @date 2026-10-15
 * @description 景区导览 AI 数字人后端服务入口
 *              中间件顺序（不可调整）：traceId → operationLog → 基础中间件 → auth 解析 → 业务路由
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { logError } from './common/logger.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { operationLogMiddleware } from './middleware/operationLog.js';
import { authMiddleware } from './middleware/auth.js';
import chatRouter from './routes/chat.js';
import analyticsRouter from './analytics/routes.js';
import asrTtsRouter from './routes/asrTts.js';
import kbRouter from './routes/kb.js';
import authRouter from './routes/auth.js';
import unifiedAuthRouter from './routes/unifiedAuth.js';
import productRouter from './routes/product.js';
import contentRouter from './routes/content.js';
import adminContentRouter from './routes/adminContent.js';
import userRouter from './routes/user.js';
import uploadRouter, { UPLOAD_DIR } from './routes/upload.js';
import { ErrorCodeEnum, getZhMsg } from './constants/errorCodes.js';
import { HttpError } from './utils/httpError.js';

// ---------- 进程级兜底异常捕获：必须尽早注册 ----------
process.on('uncaughtException', (error) => {
  logError(error, 'process', { event: 'uncaughtException' });
});
process.on('unhandledRejection', (reason) => {
  logError(reason, 'process', { event: 'unhandledRejection' });
});

const app = express();

// ---------- 中间件（顺序不可调整） ----------
// 1. traceId：最先执行，后续所有中间件/业务/日志都能拿到 traceId
app.use(traceIdMiddleware);
// 2. 操作日志：自动记录所有请求
app.use(operationLogMiddleware);
// 3. 基础中间件
app.use(cors({
  origin: config.frontendUrl, // 允许前端跨域访问
  credentials: true,
  exposedHeaders: ['X-Trace-Id'] // 允许前端读取 traceId 响应头
}));
app.use(express.json());
// 4. JWT 解析（不强制登录，只把合法 token 解析进 req.user）
app.use(authMiddleware);

// ---------- 业务路由 ----------
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/asr-tts', asrTtsRouter);
app.use('/api/v1/kb', kbRouter);
app.use('/api/v1/auth', authRouter);
// 统一身份认证（邮件验证码 / 微信扫码 / 统一认证平台 / 数字证书），与账号密码通道并行
app.use('/api/v1/auth', unifiedAuthRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/content', contentRouter);
app.use('/api/v1/admin/content', adminContentRouter);
app.use('/api/v1/admin/users', userRouter);
app.use('/api/v1/admin/upload', uploadRouter);

// 静态托管：用户端可直接访问后台上传的图片（http://localhost:8000/uploads/xxx.jpg）
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// 健康检查接口
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// ---------- 404：所有路由之后、错误处理之前 ----------
app.use((req: Request, res: Response) => {
  res.status(404).json({
    code: ErrorCodeEnum.NOT_FOUND.code,
    message: ErrorCodeEnum.NOT_FOUND.zhMsg,
    traceId: req.traceId
  });
});

/**
 * 判断 message 是否为英文原始描述（全 ASCII 视为需要转中文）
 * @param message 原始错误描述
 */
function isEnglishMessage(message: string | undefined): boolean {
  if (!message) return true;
  return /^[\x00-\x7F\s]*$/.test(message);
}

/**
 * 统一转换为面向用户的中文提示
 * 业务代码抛出的中文描述优先保留，英文/空值回退到错误码的 zhMsg
 * @param code 业务错误码数字
 * @param raw 原始 message
 */
function toChineseMessage(code: number, raw: string | undefined): string {
  if (raw && !isEnglishMessage(raw)) return raw;
  return getZhMsg(code, '操作失败，请稍后重试');
}

// ---------- 统一错误处理：必须注册在所有路由之后 ----------
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const traceId = req.traceId;

  if (error instanceof HttpError) {
    // 预期内的业务异常：5xx 才记 error 级日志，4xx 只返回
    if (error.status >= 500) {
      logError(error, 'http', { method: req.method, path: req.originalUrl, code: error.code, traceId });
    }
    res.status(error.status).json({
      code: error.code,
      message: toChineseMessage(error.code, error.message),
      traceId
    });
    return;
  }

  // multer 抛出的上传异常：体积超限 / 字段异常
  if (error instanceof multer.MulterError) {
    const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
    const item = isTooLarge ? ErrorCodeEnum.PAYLOAD_TOO_LARGE : ErrorCodeEnum.INVALID_AUDIO;
    res.status(413).json({ code: item.code, message: item.zhMsg, traceId });
    return;
  }

  // express.json() 解析失败（请求体不是合法 JSON）
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      code: ErrorCodeEnum.INVALID_PARAM.code,
      message: '请求体不是合法的 JSON',
      traceId
    });
    return;
  }

  // 未预期异常：记录完整堆栈，对外只暴露中文兜底提示
  logError(error, 'http', { method: req.method, path: req.originalUrl, traceId });
  res.status(500).json({
    code: ErrorCodeEnum.INTERNAL_ERROR.code,
    message: ErrorCodeEnum.INTERNAL_ERROR.zhMsg,
    traceId
  });
});

// 启动服务
app.listen(config.port, () => {
  console.log(`🚀 后端服务已启动: http://localhost:${config.port}`);
  console.log(`🔗 允许跨域的前端地址: ${config.frontendUrl}`);
  console.log(`语音交互接口: POST /api/v1/asr-tts/asr | GET /api/v1/asr-tts/tts/stream (SSE)`);
});
