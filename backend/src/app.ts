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
import analyticsRouter, { cleanupAnalytics, startAnalyticsPush } from './analytics/routes.js';
import asrTtsRouter from './routes/asrTts.js';
import ttsRouter from './routes/tts.js';
import kbRouter from './routes/kb.js';
import lostFoundRouter from './routes/lostFound.js';
import homeRouter from './routes/home.js';
import guideRouter from './routes/guide.js';
import poiRouter from './routes/poi.js';
import logsRouter from './routes/logs.js';
import { initTables, closeDb } from './analytics/db.js';
import { initTables as initLostFoundTables } from './lostFound/db.js';
import { initTables as initLogTables } from './services/logService.js';
import { startLogQueueConsumer, stopLogQueueConsumer } from './services/logQueue.js';
import { initRedis, closeRedis } from './common/redis.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { ErrorCodeEnum } from './common/errorCodes.js';
import { HttpError } from './common/httpError.js';
import { createLogger } from './common/logger.js';

const log = createLogger('app');

const app = express();

// 中间件
app.use(cors({
  origin: config.frontendUrl, // 允许前端跨域访问
  credentials: true,
  // 暴露 traceId 响应头，否则浏览器端 response.headers.get('X-Trace-Id') 读不到
  exposedHeaders: ['X-Trace-Id']
}));
app.use(express.json());
// 全链路追踪：确定 traceId 并写入响应头（放在所有路由之前）
app.use(traceIdMiddleware);

// 路由挂载
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/asr-tts', asrTtsRouter);
app.use('/api/v1/tts', ttsRouter);
app.use('/api/v1/kb', kbRouter);
app.use('/api/v1/lost-found', lostFoundRouter);
app.use('/api/v1/home', homeRouter);
app.use('/api/v1/routes', guideRouter);
app.use('/api/v1/poi', poiRouter);
app.use('/api/v1/logs', logsRouter);

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
  log.ERROR(`[http] 未处理异常: ${String(error)}`);
  res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
});

// 启动服务（数据表初始化失败不阻断，便于无 MySQL 环境下独立开发；Redis 连不上则自动降级）
async function bootstrap(): Promise<void> {
  try {
    try {
      await initTables();
    } catch (e) {
      log.WARN(`analytics 数据表初始化跳过（MySQL 不可用）: ${String(e)}`);
    }
    try {
      await initLostFoundTables();
    } catch (e) {
      log.WARN(`lost-found 数据表初始化跳过（MySQL 不可用）: ${String(e)}`);
    }
    try {
      await initLogTables();
    } catch (e) {
      log.WARN(`logs 数据表初始化跳过（MySQL 不可用）: ${String(e)}`);
    }

    // Redis 消息队列：连不上不影响启动，日志改为直写、大屏退回本机推送
    const redisReady = await initRedis();
    if (redisReady) {
      await startLogQueueConsumer();
    }
    await startAnalyticsPush();

    app.listen(config.port, () => {
      log.INFO(`后端服务已启动: http://localhost:${config.port}`);
      log.INFO(`允许跨域的前端地址: ${config.frontendUrl}`);
      log.INFO('语音交互接口: POST /api/v1/asr-tts/asr | GET /api/v1/tts/stream (新) | GET /api/v1/asr-tts/tts/stream (旧，redirect)');
    });
  } catch (error) {
    log.ERROR(`后端服务启动失败: ${String(error)}`);
    process.exit(1);
  }
}

// 优雅关闭：先停消费者与定时器，再断开 Redis / MySQL
async function shutdown(signal: string): Promise<void> {
  log.INFO(`收到 ${signal}，正在关闭服务...`);
  await stopLogQueueConsumer();
  await cleanupAnalytics();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

bootstrap();
