/**
 * @file SSE（Server-Sent Events）通用工具模块
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 封装 SSE 响应头设置、事件推送与心跳保活，供流式接口复用。
 *              从 utils/sse.ts 迁移而来，保持逻辑完全一致，仅调整 import 路径。
 */
import type { Response } from 'express';

/** SSE 事件类型常量，避免在业务代码中散落魔法字符串 */
export const SseEventEnum = {
  /** 流式元信息：提供方、音色、采样率等 */
  META: 'meta',
  /** 音频分片 */
  AUDIO: 'audio',
  /** 正常结束 */
  DONE: 'done',
  /** 异常结束 */
  ERROR: 'error'
} as const;

/** SSE 心跳间隔（毫秒），防止代理空闲超时断开 */
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * 初始化 SSE 响应，必须显式关闭缓冲以便逐块推送
 * @param res Express 响应对象
 */
export function initSseStream(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // 关闭 Nginx 等反向代理的响应缓冲，否则前端无法逐块收到数据
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/**
 * 推送一条 SSE 事件
 * @param res Express 响应对象
 * @param event 事件名（前端用 addEventListener 监听）
 * @param data 事件负载，会被序列化为 JSON
 * @param id 可选事件序号，配合 Last-Event-ID 实现断线续传
 */
export function sendSseEvent(res: Response, event: string, data: unknown, id?: number): void {
  if (id !== undefined) {
    res.write(`id: ${id}\n`);
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 推送一条 SSE 注释行，用作心跳保活
 * @param res Express 响应对象
 * @param comment 注释内容
 */
export function sendSseComment(res: Response, comment: string): void {
  res.write(`: ${comment}\n\n`);
}

/**
 * 启动心跳定时器
 * @param res Express 响应对象
 * @returns 清理函数，调用后停止心跳
 */
export function startSseHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    sendSseComment(res, `keep-alive ${Date.now()}`);
  }, SSE_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
