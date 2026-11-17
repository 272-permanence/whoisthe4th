/**
 * @file 客服聊天 Socket.IO 事件处理入口
 * @author 第八组
 * @date 2026-11-17
 * @description 挂载到现有 Express HTTP server，处理用户注册/消息收发/客服上线等事件。
 *              客户端连接 namespace: /cs
 */
import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { createLogger } from '../common/logger.js';
import { config } from '../config.js';
import {
  ClientEvents,
  ServerEvents,
  type OnlineUser,
  type ChatMessage,
  type Agent,
} from './types.js';
import {
  addOnlineUser,
  removeOnlineUser,
  getOnlineUser,
  getOnlineUserBySocket,
  getAllOnlineUsers,
  addAgent,
  removeAgent,
  getAgent,
  getAgentBySocket,
  getAllAgents,
  agentServeUser,
  agentReleaseUser,
  addMessage,
  getMessages,
  genMsgId,
  getConversationId,
} from './store.js';

const log = createLogger('cs-socket');

/** 客服 namespace */
let io: Server | null = null;

/**
 * 初始化 Socket.IO 并挂载到 HTTP server
 * @param httpServer Express 启动时的 http.Server 实例
 */
export function initCsSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: {
      origin: config.frontendUrl,
      credentials: true,
    },
    // 保持连接配置（和现有 SSE 心跳呼应）
    pingInterval: 20000,
    pingTimeout: 20000,
    connectTimeout: 10000,
  });

  // 客服聊天专属 namespace：/cs
  const nsp = io.of('/cs');

  nsp.on('connection', (socket: Socket) => {
    log.INFO(`[WS] 新连接 socketId=${socket.id}`);

    // ========== 用户/客服注册 ==========
    // 客户端连接后必须先 send cs:register，服务端确认身份后才开始路由消息
    socket.on(ClientEvents.REGISTER, (payload: RegisterPayload, ack?: (...args: unknown[]) => void) => {
      handleRegister(socket, payload, ack);
    });

    // ========== 用户发消息 ==========
    socket.on(ClientEvents.USER_SEND, (payload: SendPayload) => {
      handleUserSend(socket, payload);
    });

    // ========== 客服发消息 ==========
    socket.on(ClientEvents.AGENT_SEND, (payload: SendPayload) => {
      handleAgentSend(socket, payload);
    });

    // ========== 客服接入用户 ==========
    socket.on(ClientEvents.AGENT_JOIN, (payload: AgentJoinPayload, ack?: (...args: unknown[]) => void) => {
      handleAgentJoin(socket, payload, ack);
    });

    // ========== 客服完成服务 ==========
    socket.on(ClientEvents.AGENT_LEAVE, (payload: AgentLeavePayload) => {
      handleAgentLeave(socket, payload);
    });

    // ========== 断开连接 ==========
    socket.on('disconnect', (reason) => {
      handleDisconnect(socket, reason);
    });

    socket.on('connect_error', (err) => {
      log.ERROR(`[WS] 连接错误: ${err.message}`);
    });
  });

  log.INFO('[WS] 客服聊天 Socket.IO 已挂载到 namespace /cs');
}

// ========== 事件载荷类型 ==========

interface RegisterPayload {
  /** 'user' | 'agent' */
  role: 'user' | 'agent';
  /** 昵称（用户可填，客服必填） */
  nickname?: string;
  /** 登录用户的 userId（可选） */
  userId?: string;
  /** 登录态 token（可选，用于校验客服身份） */
  token?: string;
}

interface RegisterAck {
  ok: boolean;
  user?: { id: string; nickname: string; role: 'user' | 'agent' };
  error?: string;
}

interface SendPayload {
  /** 消息内容 */
  content: string;
  /** 接收方：user 发时传 agentId（可选，MVP 默认发给当前服务的客服）；agent 发时必填 userId */
  targetId?: string;
}

interface AgentJoinPayload {
  /** 要接入的 userId */
  userId: string;
}

interface AgentLeavePayload {
  /** 要离开的 userId（可选，不传则释放当前服务） */
  userId?: string;
}

// ========== 事件处理函数 ==========

/** 注册身份 */
function handleRegister(socket: Socket, payload: RegisterPayload, ack?: (res: RegisterAck) => void): void {
  const { role, nickname = '访客', userId, token } = payload;

  if (role === 'agent') {
    // ---------- 客服注册 ----------
    // MVP：暂不严格校验 token（由前端路由守卫保证只有 admin 角色能进客服工作台）
    // 正式环境应校验 JWT 的 role === 'admin'
    const agentId = userId ?? `agent-${socket.id.slice(0, 6)}`;
    const agent: Agent = {
      id: agentId,
      nickname: nickname || `客服-${agentId.slice(0, 4)}`,
      socketId: socket.id,
      servingUserId: null,
    };
    addAgent(agent);
    socket.data.role = 'agent';
    socket.data.agentId = agentId;

    // 客服加入全局房间（接收用户上线/列表通知）
    socket.join('agents');

    log.INFO(`[WS] 客服上线 id=${agentId} nickname=${agent.nickname}`);

    // 推给客服：当前在线用户列表
    socket.emit(ServerEvents.USER_LIST, getAllOnlineUsers());

    ack?.({ ok: true, user: { id: agentId, nickname: agent.nickname, role: 'agent' } });
  } else {
    // ---------- 用户注册 ----------
    // 匿名用户用 socket.id 生成临时 ID，登录用户用 userId
    const finalUserId = userId ?? `anon-${socket.id.slice(0, 8)}`;
    const user: OnlineUser = {
      id: finalUserId,
      nickname: nickname || (userId ? `用户-${userId.slice(-4)}` : `访客-${socket.id.slice(0, 4)}`),
      isLoggedIn: !!userId,
      socketId: socket.id,
      connectedAt: Date.now(),
    };
    addOnlineUser(user);
    socket.data.role = 'user';
    socket.data.userId = finalUserId;

    // 每个用户一个专属房间，客服发消息时直接推到这个房间
    socket.join(`user-${finalUserId}`);

    log.INFO(`[WS] 用户上线 id=${finalUserId} nickname=${user.nickname}`);

    // 广播给所有在线客服：有新用户上线
    socket.to('agents').emit(ServerEvents.USER_ONLINE, user);

    // 同时刷新所有客服的在线用户列表
    socket.to('agents').emit(ServerEvents.USER_LIST, getAllOnlineUsers());

    // 回复用户：注册成功
    ack?.({ ok: true, user: { id: finalUserId, nickname: user.nickname, role: 'user' } });
  }
}

/** 用户发消息 → 推给服务该用户的客服 */
function handleUserSend(socket: Socket, payload: SendPayload): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) {
    socket.emit(ServerEvents.ERROR, { message: '未注册，请先 cs:register' });
    return;
  }

  const user = getOnlineUser(userId);
  if (!user) return;

  const content = payload.content?.trim();
  if (!content) return;

  const conversationId = getConversationId(userId);
  const msg: ChatMessage = {
    id: genMsgId(),
    role: 'user',
    senderId: userId,
    senderName: user.nickname,
    content,
    timestamp: Date.now(),
    conversationId,
  };
  addMessage(conversationId, msg);

  // 回显给发送者自己（用户发完立刻能看到自己的消息）
  socket.emit(ServerEvents.NEW_MESSAGE, msg);

  // 找到服务该用户的客服，推消息
  let delivered = false;
  for (const agent of getAllAgents()) {
    if (agent.servingUserId === userId) {
      const agentSocket = socket.nsp.sockets.get(agent.socketId);
      if (agentSocket) {
        agentSocket.emit(ServerEvents.NEW_MESSAGE, msg);
        delivered = true;
      }
      break; // 一对一，只推给一个客服
    }
  }

  // 没有专属客服 → 广播给所有在线客服（让客服工作台列表弹窗提示）
  if (!delivered) {
    socket.to('agents').emit(ServerEvents.NEW_MESSAGE, msg);
  }

  log.INFO(`[WS] 用户 ${userId} 发消息 (${content.length}字) → ${delivered ? '已推给专属客服' : '广播给所有客服'}`);
}

/** 客服发消息 → 推给对应用户 */
function handleAgentSend(socket: Socket, payload: SendPayload): void {
  const agentId = socket.data.agentId as string | undefined;
  if (!agentId) {
    socket.emit(ServerEvents.ERROR, { message: '未注册为客服，请先 cs:register' });
    return;
  }

  const agent = getAgent(agentId);
  if (!agent) return;

  const targetUserId = payload.targetId ?? agent.servingUserId;
  if (!targetUserId) {
    socket.emit(ServerEvents.ERROR, { message: '未指定目标用户' });
    return;
  }

  const content = payload.content?.trim();
  if (!content) return;

  const conversationId = getConversationId(targetUserId);
  const msg: ChatMessage = {
    id: genMsgId(),
    role: 'agent',
    senderId: agentId,
    senderName: agent.nickname,
    content,
    timestamp: Date.now(),
    conversationId,
  };
  addMessage(conversationId, msg);

  // 推给目标用户（用户在 user-{userId} 房间）
  socket.nsp.to(`user-${targetUserId}`).emit(ServerEvents.NEW_MESSAGE, msg);

  // 让客服也能看到自己发出的消息（回显）
  socket.emit(ServerEvents.NEW_MESSAGE, msg);

  log.INFO(`[WS] 客服 ${agentId} → 用户 ${targetUserId} (${content.length}字)`);
}

/** 客服接入某个用户 */
function handleAgentJoin(socket: Socket, payload: AgentJoinPayload, ack?: (res: { ok: boolean; messages?: ChatMessage[]; error?: string }) => void): void {
  const agentId = socket.data.agentId as string | undefined;
  if (!agentId) {
    ack?.({ ok: false, error: '未注册为客服' });
    return;
  }

  const { userId } = payload;
  const user = getOnlineUser(userId);
  if (!user) {
    ack?.({ ok: false, error: '该用户不在线' });
    return;
  }

  agentServeUser(agentId, userId);

  // 通知用户：客服已接入
  socket.nsp.to(`user-${userId}`).emit(ServerEvents.AGENT_CONNECTED, {
    agentId,
    nickname: getAgent(agentId)?.nickname ?? '客服',
  });

  log.INFO(`[WS] 客服 ${agentId} 接入用户 ${userId}`);

  // 返回该会话历史消息给客服
  ack?.({ ok: true, messages: getMessages(getConversationId(userId)) });
}

/** 客服完成服务 */
function handleAgentLeave(socket: Socket, payload: AgentLeavePayload): void {
  const agentId = socket.data.agentId as string | undefined;
  if (!agentId) return;

  const agent = getAgent(agentId);
  if (!agent) return;

  const leaveUserId = payload.userId ?? agent.servingUserId;
  if (leaveUserId) {
    agentReleaseUser(agentId);
    // 通知用户：客服已离开
    socket.nsp.to(`user-${leaveUserId}`).emit(ServerEvents.AGENT_DISCONNECTED, { agentId });
    log.INFO(`[WS] 客服 ${agentId} 离开用户 ${leaveUserId}`);
  }
}

/** 断开连接 */
function handleDisconnect(socket: Socket, reason: string): void {
  log.INFO(`[WS] 断开 socketId=${socket.id} reason=${reason}`);

  const role = socket.data.role as 'user' | 'agent' | undefined;

  if (role === 'agent') {
    const agentId = socket.data.agentId as string;
    const agent = getAgent(agentId);
    const servingUserId = agent?.servingUserId;
    removeAgent(agentId);

    // 通知正在服务的用户
    if (servingUserId) {
      socket.nsp.to(`user-${servingUserId}`).emit(ServerEvents.AGENT_DISCONNECTED, { agentId });
    }
  } else if (role === 'user') {
    const userId = socket.data.userId as string;
    removeOnlineUser(userId);

    // 广播给所有客服
    socket.to('agents').emit(ServerEvents.USER_OFFLINE, { userId });
    socket.to('agents').emit(ServerEvents.USER_LIST, getAllOnlineUsers());
  }
}

// ========== 公共工具：发送消息辅助 ==========

/**
 * 给某个用户推消息（可用于系统通知等非 Socket 触发场景）
 */
export function pushToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  const nsp = io.of('/cs');
  nsp.to(`user-${userId}`).emit(event, data);
}

/**
 * 给所有客服推消息
 */
export function pushToAgents(event: string, data: unknown): void {
  if (!io) return;
  const nsp = io.of('/cs');
  nsp.to('agents').emit(event, data);
}

/**
 * 公共 HTTP 接口获取会话历史（给客服工作台页面刷新时调用）
 */
export function getConversationHistory(userId: string): ChatMessage[] {
  return getMessages(getConversationId(userId));
}

/**
 * 获取所有在线用户（含未读数）—— 供客服工作台列表页 HTTP 接口使用
 */
export interface UserListItem {
  id: string;
  nickname: string;
  isLoggedIn: boolean;
  connectedAt: number;
  unread: number;
  conversationId: string;
  /** 当前服务的客服昵称（如果有） */
  servingAgent: string | null;
}

export function getAllOnlineUserList(): UserListItem[] {
  const agents = getAllAgents();
  return getAllOnlineUsers().map(u => {
    const convId = getConversationId(u.id);
    const servingAgent = agents.find(a => a.servingUserId === u.id);
    return {
      id: u.id,
      nickname: u.nickname,
      isLoggedIn: u.isLoggedIn,
      connectedAt: u.connectedAt,
      unread: getMessages(convId).filter(m => m.role === 'user').length, // 用消息数做 MVP unread
      conversationId: convId,
      servingAgent: servingAgent?.nickname ?? null,
    };
  });
}
