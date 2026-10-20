/**
 * @file SSE 广播管理器
 * @author 第八组
 * @date 2026-10-15
 * @description 管理多个 SSE 客户端连接，支持广播和心跳保活。
 *              SSE 响应头、事件推送、心跳写法统一由 common/sse.ts 提供，不再手写。
 */

import type { Response } from 'express';
import {
  initSseStream,
  sendSseEvent,
  sendSseComment,
  SSE_HEARTBEAT_INTERVAL_MS
} from '../common/sse.js';

interface SseClient {
  id: string;
  res: Response;
}

class SseBroker {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * 添加客户端连接
   */
  addClient(id: string, res: Response): void {
    // SSE 响应头由公共模块统一设置，保证全组单一实现
    initSseStream(res);

    // 发送初始连接确认
    sendSseEvent(res, 'connected', { id });

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
    for (const client of this.clients.values()) {
      sendSseEvent(client.res, event, data);
    }
  }

  /**
   * 启动心跳保活，定期发送注释防止代理超时断开
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const stamp = new Date().toISOString();
      for (const client of this.clients.values()) {
        sendSseComment(client.res, `heartbeat ${stamp}`);
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);
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
