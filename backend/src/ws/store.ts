/**
 * @file 客服聊天内存状态存储
 * @author 第八组
 * @date 2026-11-17
 * @description 管理在线用户、在线客服、对话消息历史。
 *              MVP 阶段全部内存存储，重启后清空；后续可替换为 Redis / MySQL 持久化。
 */
import type { OnlineUser, Agent, ChatMessage } from './types.js';

/** 在线用户 Map：key = userId */
const onlineUsers = new Map<string, OnlineUser>();

/** 在线客服 Map：key = agentId */
const onlineAgents = new Map<string, Agent>();

/**
 * 对话消息存储：key = conversationId（按 user.agent 维度）
 * conversationId 格式：`conv-${userId}` （一对一，每个用户一个独立会话）
 */
const messages = new Map<string, ChatMessage[]>();

/** 会话中最后一条未读消息计数：key = conversationId */
const unreadCounts = new Map<string, number>();

/** 生成会话 ID（一对一：每个用户一个独立会话） */
export function getConversationId(userId: string): string {
  return `conv-${userId}`;
}

// ========== 用户操作 ==========

/** 用户上线 */
export function addOnlineUser(user: OnlineUser): void {
  onlineUsers.set(user.id, user);
}

/** 用户下线 */
export function removeOnlineUser(userId: string): void {
  onlineUsers.delete(userId);
  // 如果这个用户有正在服务的客服，释放客服
  for (const agent of onlineAgents.values()) {
    if (agent.servingUserId === userId) {
      agent.servingUserId = null;
    }
  }
}

/** 根据 userId 查找在线用户 */
export function getOnlineUser(userId: string): OnlineUser | undefined {
  return onlineUsers.get(userId);
}

/** 根据 socketId 查找在线用户 */
export function getOnlineUserBySocket(socketId: string): OnlineUser | undefined {
  for (const user of onlineUsers.values()) {
    if (user.socketId === socketId) return user;
  }
  return undefined;
}

/** 获取所有在线用户列表 */
export function getAllOnlineUsers(): OnlineUser[] {
  return Array.from(onlineUsers.values());
}

/** 根据 socketId 找到 userId */
export function findUserIdBySocket(socketId: string): string | undefined {
  const user = getOnlineUserBySocket(socketId);
  return user?.id;
}

// ========== 客服操作 ==========

/** 客服上线 */
export function addAgent(agent: Agent): void {
  onlineAgents.set(agent.id, agent);
}

/** 客服下线 */
export function removeAgent(agentId: string): void {
  const agent = onlineAgents.get(agentId);
  if (agent?.servingUserId) {
    // 释放正在服务的用户
    agent.servingUserId = null;
  }
  onlineAgents.delete(agentId);
}

/** 根据 agentId 查找客服 */
export function getAgent(agentId: string): Agent | undefined {
  return onlineAgents.get(agentId);
}

/** 根据 socketId 查找客服 */
export function getAgentBySocket(socketId: string): Agent | undefined {
  for (const agent of onlineAgents.values()) {
    if (agent.socketId === socketId) return agent;
  }
  return undefined;
}

/** 获取所有在线客服 */
export function getAllAgents(): Agent[] {
  return Array.from(onlineAgents.values());
}

/** 客服接入某个用户 */
export function agentServeUser(agentId: string, userId: string): boolean {
  const agent = onlineAgents.get(agentId);
  if (!agent) return false;
  agent.servingUserId = userId;
  return true;
}

/** 客服完成服务（释放用户） */
export function agentReleaseUser(agentId: string): void {
  const agent = onlineAgents.get(agentId);
  if (agent) agent.servingUserId = null;
}

// ========== 消息操作 ==========

/** 追加一条消息到会话 */
export function addMessage(conversationId: string, msg: ChatMessage): void {
  const list = messages.get(conversationId) ?? [];
  list.push(msg);
  messages.set(conversationId, list);

  // 增加未读数
  const current = unreadCounts.get(conversationId) ?? 0;
  unreadCounts.set(conversationId, current + 1);

  // MVP 内存存储上限：每个会话最多保留 200 条
  if (list.length > 200) {
    messages.set(conversationId, list.slice(-200));
  }
}

/** 获取会话消息历史 */
export function getMessages(conversationId: string): ChatMessage[] {
  return messages.get(conversationId) ?? [];
}

/** 获取未读数 */
export function getUnreadCount(conversationId: string): number {
  return unreadCounts.get(conversationId) ?? 0;
}

/** 清零未读 */
export function clearUnread(conversationId: string): void {
  unreadCounts.set(conversationId, 0);
}

// ========== 工具：生成唯一 ID ==========

let idCounter = 0;
export function genMsgId(): string {
  idCounter = (idCounter + 1) % 100000;
  return `msg-${Date.now()}-${idCounter}`;
}
