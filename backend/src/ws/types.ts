/**
 * @file 客服聊天 WebSocket 类型定义
 * @author 第八组
 * @date 2026-11-17
 */

/** 用户角色 */
export type ChatRole = 'user' | 'agent';

/** 在线用户 */
export interface OnlineUser {
  /** 用户唯一标识（匿名用户用 socket.id 的哈希，登录用户用 userId） */
  id: string;
  /** 昵称 */
  nickname: string;
  /** 是否登录用户 */
  isLoggedIn: boolean;
  /** 绑定的 socket.id */
  socketId: string;
  /** 连接时间 */
  connectedAt: number;
}

/** 客服 */
export interface Agent {
  /** 客服 ID（用 userId） */
  id: string;
  /** 客服昵称 */
  nickname: string;
  /** 绑定的 socket.id */
  socketId: string;
  /** 当前正在服务的用户 ID（一对一） */
  servingUserId: string | null;
}

/** 聊天消息 */
export interface ChatMessage {
  /** 消息唯一 ID */
  id: string;
  /** 发送者角色 */
  role: ChatRole;
  /** 发送者 ID */
  senderId: string;
  /** 发送者昵称 */
  senderName: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 关联的会话 ID */
  conversationId: string;
}

/** Socket.IO 客户端 → 服务端事件名 */
export const ClientEvents = {
  /** 注册身份（用户连接时调用） */
  REGISTER: 'cs:register',
  /** 用户发消息 */
  USER_SEND: 'cs:user:send',
  /** 客服发消息 */
  AGENT_SEND: 'cs:agent:send',
  /** 客服接入某用户 */
  AGENT_JOIN: 'cs:agent:join',
  /** 客服断开某用户（完成服务） */
  AGENT_LEAVE: 'cs:agent:leave',
  /** 标记消息已读 */
  MARK_READ: 'cs:mark_read',
} as const;

/** Socket.IO 服务端 → 客户端事件名 */
export const ServerEvents = {
  /** 注册成功，返回分配的身份信息 */
  REGISTERED: 'cs:registered',
  /** 收到新消息 */
  NEW_MESSAGE: 'cs:new_message',
  /** 新用户上线（推给所有客服） */
  USER_ONLINE: 'cs:user_online',
  /** 用户下线（推给所有客服） */
  USER_OFFLINE: 'cs:user_offline',
  /** 当前服务的用户列表更新（推给客服） */
  USER_LIST: 'cs:user_list',
  /** 客服上线通知用户（让用户知道已有人回复） */
  AGENT_CONNECTED: 'cs:agent_connected',
  /** 客服下线/离开 */
  AGENT_DISCONNECTED: 'cs:agent_disconnected',
  /** 服务端错误 */
  ERROR: 'cs:error',
  /** 消息已读回执 */
  READ_RECEIPT: 'cs:read_receipt',
} as const;
