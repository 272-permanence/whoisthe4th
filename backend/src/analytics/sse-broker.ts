/**
 * @file SSE 广播管理器
 * @author 第八组
 * @date 2026-10-15
 * @description 管理多个 SSE 客户端连接，支持广播和心跳保活
 */

import type { Response } from 'express';

interface SseClient {
  id: string;
  res: Response;
}

class SseBroker {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private static HEARTBEAT_INTERVAL = 15000; // 15 秒心跳

  constructor() {
    this.startHeartbeat();
  }

  /**
   * 添加客户端连接
   */
  addClient(id: string, res: Response): void {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

    // 发送初始连接确认
    res.write(`event: connected\ndata: ${JSON.stringify({ id })}\n\n`);

    this.clients.set(id, { id, res });

    // 客户端断开时清理
    res.on('close', () => {
      this.removeClient(id);
    });
  }

  /**
   * 移除客户端
   */
  removeClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * 向所有客户端广播数据
   */
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.values()) {
      client.res.write(payload);
    }
  }

  /**
   * 启动心跳保活，定期发送注释防止代理超时断开
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const heartbeat = `: heartbeat ${new Date().toISOString()}\n\n`;
      for (const client of this.clients.values()) {
        client.res.write(heartbeat);
      }
    }, SseBroker.HEARTBEAT_INTERVAL);
  }

  /**
   * 获取当前连接数
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 关闭所有连接并停止心跳
   */
  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients.values()) {
      client.res.end();
    }
    this.clients.clear();
  }
}

// 单例
export const sseBroker = new SseBroker();
