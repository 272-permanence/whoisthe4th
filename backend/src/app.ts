import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import chatRouter from './routes/chat.js';

const app = express();

// 中间件
app.use(cors({
  origin: config.frontendUrl, // 允许前端跨域访问
  credentials: true
}));
app.use(express.json());

// 路由挂载
app.use('/api/v1/chat', chatRouter);

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '景区导览 AI 后端 (Node.js) 运行中' });
});

// 启动服务
app.listen(config.port, () => {
  console.log(`🚀 后端服务已启动: http://localhost:${config.port}`);
  console.log(`🔗 允许跨域的前端地址: ${config.frontendUrl}`);
});