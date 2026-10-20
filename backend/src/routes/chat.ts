import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { searchKnowledge, getDocument } from '../services/kbKnowledgeBaseService.js';
import { saveConversation, saveRagSources, newSessionId } from '../services/conversationStore.js';
import { initSseStream, sendSseEvent, startSseHeartbeat, SseEventEnum } from '../common/sse.js';
import { createLogger } from '../common/logger.js';
import { ErrorCodeEnum } from '../common/errorCodes.js';

const router = Router();
const log = createLogger('chat-stream');

/** RAG 引用来源（前端展示用） */
interface RagSource {
  docName: string;
  snippet: string;
  score?: number;
}

/** 检索知识块 → 拼进 system prompt 的前缀 */
function buildRagContext(hits: Array<{ text: string; documentId: string; score: number }>): string {
  if (hits.length === 0) return '';
  const passages = hits
    .map((h, i) => `[知识块${i + 1}] ${h.text}`)
    .join('\n\n');
  return `以下是知识库中检索到的相关内容，请**优先基于这些内容**回答用户问题：\n\n${passages}\n\n（回答时请自然融入，不必逐条标注知识块编号）\n\n用户问题：`;
}

/** 从检索结果构建前端可展示的 sources */
function buildSources(hits: Array<{ text: string; documentId: string; score: number }>): RagSource[] {
  return hits.map((h) => {
    const doc = getDocument(h.documentId);
    return {
      docName: doc?.fileName ?? h.documentId,
      snippet: h.text,
      score: h.score,
    };
  });
}

// POST /api/v1/chat/stream  ——  SSE 流式接口
// 入参兼容两种格式：
//   单轮对话: { message: string }
//   多轮对话: { messages: [{ role: 'user'|'assistant', content: string }, ...] }
router.post('/stream', async (req: Request, res: Response) => {
  const { message, messages } = req.body || {};

  // 参数校验
  let chatMessages: Array<{ role: string; content: string }>;
  let userQuestion = '';
  if (Array.isArray(messages) && messages.length > 0) {
    chatMessages = messages;
    // 取最后一条用户消息做 RAG 检索
    const lastUser = [...chatMessages].reverse().find(m => m.role === 'user');
    userQuestion = lastUser?.content ?? '';
  } else if (typeof message === 'string' && message.trim()) {
    userQuestion = message;
    chatMessages = [
      { role: 'system', content: '你是一个专业的景区导览AI助手，能够生动地介绍景区历史、文化和亮点。请用中文回答。' },
      { role: 'user', content: message },
    ];
  } else {
    res.status(400).json({ error: '请提供 message (string) 或 messages (array) 参数', code: ErrorCodeEnum.INVALID_PARAM });
    log.WARN('参数校验失败，未提供 message 或 messages');
    return;
  }

  // ========== RAG 语义检索 ==========
  let ragSources: RagSource[] = [];
  let ragContext = '';
  try {
    if (userQuestion) {
      const hits = await searchKnowledge(userQuestion, 5);
      if (hits.length > 0) {
        ragSources = buildSources(hits);
        ragContext = buildRagContext(hits);
        // 把检索到的知识块注入到 system prompt
        const systemMsg = chatMessages.find(m => m.role === 'system');
        if (systemMsg) {
          systemMsg.content += '\n\n' + ragContext;
        } else {
          chatMessages.unshift({
            role: 'system',
            content: '你是一个专业的景区导览AI助手。\n\n' + ragContext,
          });
        }
        log.INFO(`RAG 检索到 ${hits.length} 个知识块，来源: ${ragSources.map(s => s.docName).join(', ')}`);
      } else {
        log.INFO('RAG 知识库未命中（可能尚未上传文档或向量库为空），直接使用 LLM 回答');
      }
    }
  } catch (err) {
    log.WARN(`RAG 检索失败，降级为纯 LLM 回答: ${err instanceof Error ? err.message : err}`);
  }

  // 设置 SSE 响应头（用队友 common/sse.ts 统一封装）
  // 注意：cors() 中间件已在 app.ts 处理跨域，此处不再手动 setHeader
  initSseStream(res);

  // 心跳保活（队友 common/sse.ts 统一封装，默认 15s）
  const stopHeartbeat = startSseHeartbeat(res);

  try {
    const fullAssistantReply = await streamFromDashScope(chatMessages, res, ragSources);

    // ========== 持久化到 MySQL ==========
    // sessionId：前端可以通过 messages 数组长度判断多轮，这里简化为每次生成一个
    const sessionId = req.body?.sessionId ?? newSessionId();
    const ragUsed = ragSources.length > 0;

    // 保存 user 消息
    await saveConversation(sessionId, 'user', userQuestion, false);

    // 保存 assistant 回复（拿到刚生成的完整内容）
    const assistantConvId = await saveConversation(sessionId, 'assistant', fullAssistantReply, ragUsed);

    // 保存 RAG 引用来源
    if (ragUsed) {
      await saveRagSources(assistantConvId, ragSources.map(s => ({
        convId: assistantConvId,
        docName: s.docName,
        snippet: s.snippet,
        score: s.score,
      })));
    }
    log.INFO(`conversation-store 已持久化 session=${sessionId} ragUsed=${ragUsed}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.ERROR(`SSE ERROR: ${msg}`);
    sendSseEvent(res, SseEventEnum.ERROR, { message: msg, code: ErrorCodeEnum.INTERNAL_ERROR });
    sendSseEvent(res, SseEventEnum.DONE, {});
  } finally {
    stopHeartbeat();
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
  ragSources: RagSource[] = [],
): Promise<string> {
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
            sendSseEvent(res, 'token', { content: delta }, seq++);
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  }

  sendSseEvent(res, SseEventEnum.DONE, { fullContent, sources: ragSources.length > 0 ? ragSources : undefined });

  return fullContent;
}

export default router;
