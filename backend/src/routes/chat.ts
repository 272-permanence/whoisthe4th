import { Router, Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

// 模拟 AI 流式接口
router.post('/stream', async (req: Request, res: Response) => {
  const { message } = req.body || '';

  // 设置 SSE 响应头 (极其重要)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', config.frontendUrl);

  const responseText = `你好！我收到了你的消息：“${message || '空消息'}”。我是景区导览AI，Node.js 后端骨架已跑通！`;

  let index = 0;
  
  // 模拟 AI 逐字吐字 (打字机效果)
  const interval = setInterval(() => {
    if (index < responseText.length) {
      const char = responseText[index];
      
      // 发送 SSE 格式的数据
      const data = JSON.stringify({ type: 'text', content: char });
      res.write(`data: ${data}\n\n`);
      
      index++;
    } else {
      // 发送完毕
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 50);

  // 如果前端断开连接，清理定时器
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

export default router;