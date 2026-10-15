/**
 * @file 应用入口：中间件注册、路由挂载、统一错误处理
 * @author 第八组
 * @date 2026-10-15
 * @description 景区导览 AI 数字人后端服务入口
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import chatRouter from './routes/chat.js';
import analyticsRouter from './analytics/routes.js';
import asrTtsRouter from './routes/asrTts.js';
import { ErrorCodeEnum } from './constants/errorCodes.js';
import { HttpError } from './utils/httpError.js';

const app = express();

// 中间件
app.use(cors({
  origin: config.frontendUrl, // 允许前端跨域访问
  credentials: true
}));
app.use(express.json());

// 路由挂载
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/asr-tts', asrTtsRouter);

// 健康检查接口
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// 统一错误处理：必须注册在所有路由之后
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  // multer 抛出的上传异常：体积超限 / 字段异常
  if (error instanceof multer.MulterError) {
    const code = error.code === 'LIMIT_FILE_SIZE' ? ErrorCodeEnum.PAYLOAD_TOO_LARGE : ErrorCodeEnum.INVALID_AUDIO;
    res.status(400).json({ code, message: `音频上传失败: ${error.message}` });
    return;
  }
  console.error('[http] 未处理异常: %s', error);
  res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
});

// 启动服务
app.listen(config.port, () => {
  console.log(`🚀 后端服务已启动: http://localhost:${config.port}`);
  console.log(`🔗 允许跨域的前端地址: ${config.frontendUrl}`);
  console.log(`语音交互接口: POST /api/v1/asr-tts/asr | GET /api/v1/asr-tts/tts/stream (SSE)`);
});
