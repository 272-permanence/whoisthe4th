/**
 * @file 客服聊天 Socket.IO 客户端 composable
 * @author 第八组
 * @date 2026-11-17
 * @description 封装 socket.io-client，供用户端客服聊天页 + 客服工作台复用。
 *              核心职责：连接管理、身份注册、消息收发、连接状态追踪。
 */
import { ref, readonly } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants/apiConstants';

/** 聊天消息结构（和后端 types.ts 保持一致） */
export interface CsMessage {
  id: string;
  role: 'user' | 'agent';
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  conversationId: string;
}

/** 注册成功返回的身份信息 */
export interface CsIdentity {
  id: string;
  nickname: string;
  role: 'user' | 'agent';
}

/** 在线用户（客服工作台视角） */
export interface CsOnlineUser {
  id: string;
  nickname: string;
  isLoggedIn: boolean;
  connectedAt: number;
  conversationId: string;
  servingAgent: string | null;
}

/** 客服连接状态 */
export type CsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/** Socket.IO namespace */
const CS_NAMESPACE = '/cs';

/** 后端事件名（和后端 ws/types.ts 保持一致） */
const EVENTS = {
  REGISTER: 'cs:register',
  REGISTERED: 'cs:registered',
  USER_SEND: 'cs:user:send',
  AGENT_SEND: 'cs:agent:send',
  AGENT_JOIN: 'cs:agent:join',
  AGENT_LEAVE: 'cs:agent:leave',
  NEW_MESSAGE: 'cs:new_message',
  USER_ONLINE: 'cs:user_online',
  USER_OFFLINE: 'cs:user_offline',
  USER_LIST: 'cs:user_list',
  AGENT_CONNECTED: 'cs:agent_connected',
  AGENT_DISCONNECTED: 'cs:agent_disconnected',
  ERROR: 'cs:error',
} as const;

/** composable 返回值类型 */
export interface UseCsSocketReturn {
  /** 连接状态（只读） */
  status: Readonly<ReturnType<typeof ref<CsConnectionStatus>>>['value'];
  /** 当前身份信息 */
  identity: Readonly<ReturnType<typeof ref<CsIdentity | null>>>['value'];
  /** 当前收到的所有消息（按角色过滤，只保留自己相关的） */
  messages: Readonly<ReturnType<typeof ref<CsMessage[]>>>['value'];
  /** 当前在线用户列表（客服工作台才有数据） */
  onlineUsers: Readonly<ReturnType<typeof ref<CsOnlineUser[]>>>['value'];
  /** 连接并注册身份 */
  connect: (role: 'user' | 'agent', opts?: { nickname?: string; userId?: string }) => Promise<CsIdentity>;
  /** 断开连接 */
  disconnect: () => void;
  /** 用户发消息 */
  userSend: (content: string) => void;
  /** 客服发消息 */
  agentSend: (targetUserId: string, content: string) => void;
  /** 客服接入用户（返回该用户的历史消息） */
  agentJoin: (userId: string) => Promise<CsMessage[]>;
  /** 客服离开用户 */
  agentLeave: (userId?: string) => void;
  /** 清空本地消息列表（切会话时用） */
  clearMessages: () => void;
}

/** 单例：全局 socket 实例，避免多次 connect */
let _socket: Socket | null = null;

export function useCsSocket() {
  const status = ref<CsConnectionStatus>('idle');
  const identity = ref<CsIdentity | null>(null);
  const messages = ref<CsMessage[]>([]);
  const onlineUsers = ref<CsOnlineUser[]>([]);

  /**
   * 建立 Socket.IO 连接
   */
  function _ensureSocket(): Socket {
    if (_socket && _socket.connected) return _socket;

    status.value = 'connecting';

    _socket = io(API_BASE_URL + CS_NAMESPACE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    _socket.on('connect', () => {
      status.value = 'connected';
    });

    _socket.on('disconnect', (reason) => {
      status.value = reason === 'io client disconnect' ? 'disconnected' : 'error';
    });

    _socket.on('connect_error', () => {
      status.value = 'error';
    });

    // ======== 服务端事件监听 ========
    _socket.on(EVENTS.REGISTERED, () => {
      // ack 回调已经处理，这里可以忽略
    });

    _socket.on(EVENTS.NEW_MESSAGE, (msg: CsMessage) => {
      messages.value.push(msg);
    });

    _socket.on(EVENTS.USER_ONLINE, (_user: CsOnlineUser) => {
      // 客服视角：有新用户上线
      if (identity.value?.role === 'agent') {
        // 刷新列表
        _refreshUserList();
      }
    });

    _socket.on(EVENTS.USER_OFFLINE, (_data: { userId: string }) => {
      if (identity.value?.role === 'agent') {
        _refreshUserList();
      }
    });

    _socket.on(EVENTS.USER_LIST, (list: CsOnlineUser[]) => {
      onlineUsers.value = list;
    });

    _socket.on(EVENTS.AGENT_CONNECTED, (info: { agentId: string; nickname: string }) => {
      // 用户视角：收到客服已接入的系统消息
      messages.value.push({
        id: `sys-${Date.now()}`,
        role: 'agent',
        senderId: info.agentId,
        senderName: info.nickname,
        content: `客服 ${info.nickname} 已接入`,
        timestamp: Date.now(),
        conversationId: '',
      });
    });

    _socket.on(EVENTS.AGENT_DISCONNECTED, (info: { agentId: string }) => {
      // 用户视角：客服离开
      messages.value.push({
        id: `sys-${Date.now()}`,
        role: 'agent',
        senderId: info.agentId,
        senderName: '客服',
        content: '客服已离开，请稍候',
        timestamp: Date.now(),
        conversationId: '',
      });
    });

    _socket.on(EVENTS.ERROR, (err: { message: string }) => {
      console.warn('[CS] 服务端错误:', err.message);
    });

    return _socket;
  }

  /**
   * 刷新在线用户列表（客服视角）
   * 走 REST 接口（GET /api/v1/cs/users）比 Socket 事件更稳妥
   */
  async function _refreshUserList(): Promise<void> {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/cs/users`);
      const json = await resp.json();
      if (json?.code === 0) {
        onlineUsers.value = json.data as CsOnlineUser[];
      }
    } catch {
      // 静默失败（Socket 事件本身也会推送列表，这是兜底）
    }
  }

  /**
   * 连接并注册身份
   */
  function connect(
    role: 'user' | 'agent',
    opts: { nickname?: string; userId?: string } = {},
  ): Promise<CsIdentity> {
    return new Promise((resolve, reject) => {
      const sock = _ensureSocket();

      // 如果还没连上，等 connect 事件
      if (!sock.connected) {
        sock.once('connect', () => {
          _doRegister(sock, role, opts, resolve, reject);
        });
      } else {
        _doRegister(sock, role, opts, resolve, reject);
      }
    });
  }

  function _doRegister(
    sock: Socket,
    role: 'user' | 'agent',
    opts: { nickname?: string; userId?: string },
    resolve: (id: CsIdentity) => void,
    reject: (err: Error) => void,
  ): void {
    sock.emit(
      EVENTS.REGISTER,
      { role, nickname: opts.nickname, userId: opts.userId },
      (ack: { ok: boolean; user?: CsIdentity; error?: string }) => {
        if (ack.ok && ack.user) {
          identity.value = ack.user;
          resolve(ack.user);
        } else {
          reject(new Error(ack.error ?? '注册失败'));
        }
      },
    );
  }

  function disconnect(): void {
    _socket?.disconnect();
    _socket = null;
    status.value = 'idle';
    identity.value = null;
  }

  function userSend(content: string): void {
    if (!_socket || !identity.value || identity.value.role !== 'user') return;
    _socket.emit(EVENTS.USER_SEND, { content });
  }

  function agentSend(targetUserId: string, content: string): void {
    if (!_socket || !identity.value || identity.value.role !== 'agent') return;
    _socket.emit(EVENTS.AGENT_SEND, { content, targetId: targetUserId });
  }

  function agentJoin(userId: string): Promise<CsMessage[]> {
    return new Promise((resolve, reject) => {
      if (!_socket) {
        reject(new Error('未连接'));
        return;
      }
      _socket.emit(
        EVENTS.AGENT_JOIN,
        { userId },
        (ack: { ok: boolean; messages?: CsMessage[]; error?: string }) => {
          if (ack.ok) {
            messages.value = ack.messages ?? [];
            resolve(ack.messages ?? []);
          } else {
            reject(new Error(ack.error ?? '接入失败'));
          }
        },
      );
    });
  }

  function agentLeave(userId?: string): void {
    if (!_socket) return;
    _socket.emit(EVENTS.AGENT_LEAVE, { userId });
  }

  function clearMessages(): void {
    messages.value = [];
  }

  return {
    status: readonly(status),
    identity: readonly(identity),
    messages: readonly(messages),
    onlineUsers: readonly(onlineUsers),
    connect,
    disconnect,
    userSend,
    agentSend,
    agentJoin,
    agentLeave,
    clearMessages,
  };
}
