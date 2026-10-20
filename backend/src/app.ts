import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import chatRouter from './routes/chat.js';
import analyticsRouter from './analytics/routes.js';
import { initTables } from './analytics/db.js';
import { logger } from './utils/logger.js';

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

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// 启动服务（先初始化数据表，再监听端口）
async function bootstrap(): Promise<void> {
  try {
    await initTables();
    app.listen(config.port, () => {
      logger.info(`后端服务已启动: http://localhost:${config.port}`);
      logger.info(`允许跨域的前端地址: ${config.frontendUrl}`);
    });
  } catch (error) {
    logger.error('后端服务启动失败', error);
    process.exit(1);
  }
}

bootstrap();