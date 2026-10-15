import { Router, Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

// POST /api/v1/chat/stream  ——  SSE 流式接口
// 入参兼容两种格式：
//   单轮对话: { message: string }
//   多轮对话: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
router.post('/stream', async (req: Request, res: Response) => {
  const { message, messages } = req.body || {};

  // 参数校验
  let chatMessages: Array<{ role: string; content: string }>;
  if (Array.isArray(messages) && messages.length > 0) {
    chatMessages = messages;
  } else if (typeof message === 'string' && message.trim()) {
    chatMessages = [
      { role: 'system', content: '你是一个专业的景区导览AI助手，能够生动地介绍景区历史、文化和亮点。请用中文回答。' },
      { role: 'user', content: message },
    ];
  } else {
    res.status(400).json({ error: '请提供 message (string) 或 messages (array) 参数' });
    return;
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', config.frontendUrl);
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

  // 心跳保活（25 秒一次，防止代理/负载均衡器超时断开）
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  try {
    await streamFromDashScope(chatMessages, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SSE ERROR]', msg);
    res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* 已关闭 */ }
  }
});

/**
 * 向后端客户端（DashScope）发起流式请求，转发给前端
 * @param messages 对话消息数组
 * @param res Express Response
 * @param signal 用于中断上游请求的 AbortSignal
 */
async function streamFromDashScope(
  messages: Array<{ role: string; content: string }>,
  res: Response,
): Promise<void> {
  const { apiKey, model, baseUrl } = config.dashscope;

  if (!apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
    throw new Error('DASHSCOPE_API_KEY 未配置，请在 .env 中设置');
  }

  const upstream = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, stream: true, messages }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    throw new Error(`DashScope 请求失败 [${upstream.status}]: ${errText}`);
  }

  // 按 SSE 事件边界解析上游流
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let seq = 0;
  let fullContent = '';

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`id: ${seq++}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const eventStr = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      if (!eventStr) continue;

      const dataLines = eventStr
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim());

      for (const line of dataLines) {
        if (line === '[DONE]') continue;

        try {
          const json = JSON.parse(line);
          const delta = json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            fullContent += delta;
            sendEvent('token', { content: delta });
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  }

  sendEvent('done', { fullContent });
}

export default router;
