/**
 * @file 应用入口：中间件注册、路由挂载、统一错误处理
 * @author 第八组
 * @date 2026-10-15
 * @description 景区导览 AI 数字人后端服务入口（合并 A/B/C/D 全部路由 + 日志系统 + Redis）
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { ErrorCodeEnum } from './constants/errorCodes.js';
import { HttpError } from './utils/httpError.js';
import { createLogger } from './common/logger.js';

// ========== 路由导入 ==========
// 成员A：语音交互 + 数据分析
import chatRouter from './routes/chat.js';
import analyticsRouter, { cleanupAnalytics, startAnalyticsPush } from './analytics/routes.js';
import asrTtsRouter from './routes/asrTts.js';
import ttsRouter from './routes/tts.js';

// 成员B：高德路径规划代理（导航页用）
import navigationRouter from './routes/navigation.js';

// 成员C：知识库 + 鉴权 + 内容管理 + 图片上传
import kbRouter from './routes/kb.js';
import authRouter from './routes/auth.js';
import productRouter from './routes/product.js';
import contentRouter from './routes/content.js';
import adminContentRouter from './routes/adminContent.js';
import userRouter from './routes/user.js';
import uploadRouter, { UPLOAD_DIR } from './routes/upload.js';

// 成员D：移动端模块 + 日志审计
import lostFoundRouter from './routes/lostFound.js';
import homeRouter from './routes/home.js';
import guideRouter from './routes/guide.js';
import poiRouter from './routes/poi.js';
import logsRouter from './routes/logs.js';

// ========== 初始化函数 & 中间件 ==========
import { initAnalyticsTables, closeDb } from './analytics/db.js';
import { initTables as initLostFoundTables } from './lostFound/db.js';
import { initTables as initLogTables } from './services/logService.js';
import { startLogQueueConsumer, stopLogQueueConsumer } from './services/logQueue.js';
import { initRedis, closeRedis } from './common/redis.js';
import { traceIdMiddleware } from './middleware/traceId.js';
import { authMiddleware } from './middleware/auth.js';
import { operationLogMiddleware } from './middleware/operationLog.js';
import { logError } from './services/errorLogger.js';

const log = createLogger('app');
const app = express();

// ========== CORS：暴露 X-Trace-Id 响应头，前端才能读到 ==========
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  exposedHeaders: ['X-Trace-Id']
}));

app.use(express.json());

// 全链路追踪：确定 traceId 并写入 req.traceId + 响应头（放在所有中间件与业务路由之前）
app.use(traceIdMiddleware);

// 全局 JWT 解析：有合法 token 自动填充 req.user，无 token 放行（强制登录由各路由 requireAuth 完成）
app.use(authMiddleware);

// 操作日志中间件：在 traceId 与 req.user 就绪后、业务路由之前挂载，
// 自动记录所有 /api/v1/* 请求（登录/日志接口自身已跳过），异步落库不阻塞响应。
app.use(operationLogMiddleware);

// ========== 静态托管：用户端可直接访问后台上传的图片 ==========
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ========== 路由挂载 ==========
// 成员A
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/asr-tts', asrTtsRouter);
app.use('/api/v1/tts', ttsRouter);

// 成员B：高德路径规划代理（导航页用，B 独有路由）
app.use('/api/v1/navigation', navigationRouter);

// 成员C
app.use('/api/v1/kb', kbRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/content', contentRouter);
app.use('/api/v1/admin/content', adminContentRouter);
app.use('/api/v1/admin/users', userRouter);
app.use('/api/v1/admin/upload', uploadRouter);

// 成员D
app.use('/api/v1/lost-found', lostFoundRouter);
app.use('/api/v1/home', homeRouter);
app.use('/api/v1/routes', guideRouter);
app.use('/api/v1/poi', poiRouter);
app.use('/api/v1/logs', logsRouter);

// ========== 健康检查 ==========
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// ========== 统一错误处理（必须在所有路由之后）==========
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  // 统一异常控制：所有未捕获异常都进 errorLogger（Pino 文件 + error_log 表双写，异步不阻塞）
  void logError(error, req);

  if (error instanceof HttpError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    const code = error.code === 'LIMIT_FILE_SIZE' ? ErrorCodeEnum.PAYLOAD_TOO_LARGE : ErrorCodeEnum.INVALID_AUDIO;
    res.status(400).json({ code, message: `音频上传失败: ${error.message}` });
    return;
  }
  log.ERROR(`未处理异常: ${String(error)}`);
  res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
});

// ========== 启动服务 ==========
// 数据表初始化失败不阻断，便于无 MySQL 环境下独立开发；Redis 连不上则自动降级
async function bootstrap(): Promise<void> {
  try {
    try {
      await initAnalyticsTables();
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
      log.INFO(`语音交互接口: POST /api/v1/asr-tts/asr | GET /api/v1/tts/stream (新) | GET /api/v1/asr-tts/tts/stream (旧，redirect)`);
      log.INFO(`日志审计接口: GET /api/v1/logs/{operation|error|login} | GET /api/v1/logs/trace/:traceId`);
      log.INFO(`大屏统计: GET /api/v1/analytics/stats | SSE /api/v1/analytics/stream`);
    });
  } catch (error) {
    log.ERROR(`后端服务启动失败: ${error instanceof Error ? error.message : String(error)}`);
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
