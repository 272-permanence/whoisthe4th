/**
 * @file 应用入口：中间件注册、路由挂载、统一错误处理
 * @author 第八组
 * @date 2026-10-15
 * @description 景区导览 AI 数字人后端服务入口（合并 B/C/D 全部路由）
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { ErrorCodeEnum } from './constants/errorCodes.js';
import { HttpError } from './utils/httpError.js';
import { createLogger } from './common/logger.js';

// 成员B：问答 + 导航（高德路径规划代理，B 独有）
import chatRouter from './routes/chat.js';
import navigationRouter from './routes/navigation.js';

// 成员A：语音交互
import analyticsRouter from './analytics/routes.js';
import asrTtsRouter from './routes/asrTts.js';

// 成员C：知识库 + 鉴权 + 内容管理 + 图片上传
import kbRouter from './routes/kb.js';
import authRouter from './routes/auth.js';
import productRouter from './routes/product.js';
import contentRouter from './routes/content.js';
import adminContentRouter from './routes/adminContent.js';
import userRouter from './routes/user.js';
import uploadRouter, { UPLOAD_DIR } from './routes/upload.js';

// 成员D：移动端模块（首页 / 游玩攻略 / 失物招领 / POI CRUD）
import lostFoundRouter from './routes/lostFound.js';
import homeRouter from './routes/home.js';
import guideRouter from './routes/guide.js';
import dPoiRouter from './routes/poi.js';
import { initAnalyticsTables } from './analytics/db.js';

const log = createLogger('app');
const app = express();

// ========== 中间件 ==========
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());

// ========== 静态托管：用户端可直接访问后台上传的图片 ==========
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ========== 路由挂载 ==========
// 成员A
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/asr-tts', asrTtsRouter);

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
app.use('/api/v1/poi', dPoiRouter);

// ========== 健康检查 ==========
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// ========== 统一错误处理（必须在所有路由之后）==========
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    const code = error.code === 'LIMIT_FILE_SIZE' ? ErrorCodeEnum.PAYLOAD_TOO_LARGE : ErrorCodeEnum.INVALID_AUDIO;
    res.status(400).json({ code, message: `音频上传失败: ${error.message}` });
    return;
  }
  console.error('[http] 未处理异常: %s', error);
  res.status(500).json({ code: ErrorCodeEnum.INTERNAL_ERROR, message: '服务器内部错误' });
});

// ========== 启动服务 ==========
async function bootstrap(): Promise<void> {
  try {
    await initAnalyticsTables();
    app.listen(config.port, () => {
      log.INFO(`后端服务已启动: http://localhost:${config.port}`);
      log.INFO(`允许跨域的前端地址: ${config.frontendUrl}`);
    });
  } catch (error) {
    log.ERROR(`后端服务启动失败: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

bootstrap();
