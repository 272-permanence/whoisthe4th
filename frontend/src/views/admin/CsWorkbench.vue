<script setup lang="ts">
/**
 * @file 客服工作台（PC/管理员端）
 * @author 第八组
 * @date 2026-11-17
 * @description 客服专属页面，左侧在线用户列表 + 右侧对话区。
 *              - 需登录且角色为 admin（路由守卫已拦截）
 *              - 进入页面自动以客服身份连接 Socket.IO
 *              - 点击用户进入对话，实时收发消息
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../../stores/user';
import { useCsSocket, type CsOnlineUser } from '../../composables/useCsSocket';

const router = useRouter();
const userStore = useUserStore();

const {
  status,
  identity,
  messages,
  onlineUsers,
  connect,
  disconnect,
  agentJoin,
  agentSend,
  agentLeave,
  clearMessages,
} = useCsSocket();

const selectedUser = ref<CsOnlineUser | null>(null);
const inputText = ref('');
const listRef = ref<HTMLElement | null>(null);
const joinLoading = ref(false);

/** 客服昵称（优先用登录用户名） */
const agentNickname = computed(() => userStore.userInfo?.displayName || userStore.userInfo?.username || '客服');
const agentUserId = computed(() => userStore.userInfo?.id ?? undefined);

/** 当前连接状态是否可用 */
const canChat = computed(() => status.value === 'connected' && !!selectedUser.value);

/** 在线用户数 */
const onlineCount = computed(() => onlineUsers.value.length);

/** 监听连接状态变化 */
watch(status, async (s) => {
  if (s === 'connected' && !identity.value) {
    // 重连后重新注册
    try {
      await connect('agent', { nickname: agentNickname.value, userId: agentUserId.value });
    } catch (err) {
      console.warn('客服身份注册失败:', err);
    }
  }
});

/**
 * 选择一个用户开始对话
 */
async function selectUser(user: CsOnlineUser): Promise<void> {
  // 如果之前在服务别的用户，先 leave
  if (selectedUser.value && selectedUser.value.id !== user.id) {
    agentLeave(selectedUser.value.id);
  }

  joinLoading.value = true;
  selectedUser.value = user;

  try {
    await agentJoin(user.id);
  } catch (err) {
    console.warn(`接入用户 ${user.id} 失败:`, err);
    clearMessages();
  } finally {
    joinLoading.value = false;
    // 自动滚到底
    await nextTick();
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

/**
 * 发送消息
 */
function onSend(): void {
  const text = inputText.value.trim();
  if (!text || !canChat.value || !selectedUser.value) return;

  agentSend(selectedUser.value.id, text);
  inputText.value = '';
}

/**
 * 消息追加时自动滚到底
 */
watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
  },
);

/** 返回 admin 首页 */
function goBack(): void {
  if (selectedUser.value) {
    agentLeave(selectedUser.value.id);
  }
  router.push('/admin');
}

onMounted(async () => {
  try {
    await connect('agent', { nickname: agentNickname.value, userId: agentUserId.value });
  } catch (err) {
    alert(`客服连接失败: ${err instanceof Error ? err.message : '未知错误'}\n请刷新页面重试`);
  }
});

onBeforeUnmount(() => {
  if (selectedUser.value) agentLeave(selectedUser.value.id);
  disconnect();
});
</script>

<template>
  <div class="cs-workbench">
    <!-- 顶部栏 -->
    <header class="cs-wb__header">
      <button class="cs-wb__back" @click="goBack">← 返回控制台</button>
      <div class="cs-wb__title">
        <span class="cs-wb__icon">🎧</span>
        <span>客服工作台</span>
      </div>
      <div class="cs-wb__agent">
        <span class="cs-wb__status-dot" :class="status === 'connected' ? 'ok' : 'warn'" />
        <span>{{ agentNickname }} · 在线客服</span>
      </div>
    </header>

    <!-- 主体：左侧用户列表 + 右侧对话区 -->
    <div class="cs-wb__body">
      <!-- ========= 左侧：在线用户列表 ========= -->
      <aside class="cs-wb__sidebar">
        <div class="cs-wb__sidebar-title">
          在线用户 <span class="cs-wb__badge">{{ onlineCount }}</span>
        </div>
        <div v-if="onlineUsers.length === 0" class="cs-wb__sidebar-empty">
          暂无在线用户
        </div>
        <ul v-else class="cs-wb__user-list">
          <li
            v-for="u in onlineUsers"
            :key="u.id"
            :class="['cs-wb__user-item', selectedUser?.id === u.id ? 'cs-wb__user-item--active' : '']"
            @click="selectUser(u)"
          >
            <div class="cs-wb__user-avatar">
              {{ u.nickname.slice(0, 1) }}
            </div>
            <div class="cs-wb__user-info">
              <div class="cs-wb__user-name">
                {{ u.nickname }}
                <span v-if="!u.isLoggedIn" class="cs-wb__user-tag">游客</span>
              </div>
              <div class="cs-wb__user-sub">
                接入时间 {{ new Date(u.connectedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
                <span v-if="u.servingAgent" class="cs-wb__user-serving">· 服务中</span>
              </div>
            </div>
          </li>
        </ul>
      </aside>

      <!-- ========= 右侧：对话区 ========= -->
      <main class="cs-wb__main">
        <!-- 未选择用户 -->
        <div v-if="!selectedUser" class="cs-wb__empty-chat">
          <div class="cs-wb__empty-icon">👈</div>
          <div class="cs-wb__empty-text">请从左侧选择一位用户开始对话</div>
        </div>

        <!-- 已选用户 -->
        <template v-else>
          <!-- 对话标题 -->
          <div class="cs-wb__chat-title">
            <span class="cs-wb__chat-name">{{ selectedUser.nickname }}</span>
            <span class="cs-wb__chat-sub">ID: {{ selectedUser.id }}</span>
          </div>

          <!-- 消息列表 -->
          <section ref="listRef" class="cs-wb__chat-list">
            <div v-if="joinLoading" class="cs-wb__loading">加载对话记录中…</div>

            <template v-else>
              <div
                v-for="msg in messages"
                :key="msg.id"
                :class="['cs-wb__bubble', msg.role === 'agent' ? 'cs-wb__bubble--mine' : 'cs-wb__bubble--theirs']"
              >
                <div class="cs-wb__bubble-head">
                  <span class="cs-wb__bubble-name">{{ msg.senderName }}</span>
                  <span class="cs-wb__bubble-time">
                    {{ new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
                  </span>
                </div>
                <div class="cs-wb__bubble-body">{{ msg.content }}</div>
              </div>

              <div v-if="messages.length === 0" class="cs-wb__no-msg">
                还没有对话，发送第一条消息吧
              </div>
            </template>
          </section>

          <!-- 输入区 -->
          <footer class="cs-wb__chat-input">
            <textarea
              v-model="inputText"
              class="cs-wb__textarea"
              rows="2"
              placeholder="输入回复，Enter 发送，Shift+Enter 换行"
              :disabled="!canChat"
              maxlength="1000"
              @keydown.enter.exact.prevent="onSend"
            />
            <button
              class="cs-wb__send-btn"
              :disabled="!canChat || !inputText.trim()"
              @click="onSend"
            >发送</button>
          </footer>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.cs-workbench {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

/* ===== 顶部栏 ===== */
.cs-wb__header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 20px;
  background: #1f2937;
  color: #fff;
  flex-shrink: 0;
}
.cs-wb__back {
  background: rgba(255,255,255,0.1);
  border: none;
  color: #fff;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.cs-wb__back:hover { background: rgba(255,255,255,0.2); }
.cs-wb__title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cs-wb__icon { font-size: 20px; }
.cs-wb__agent {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.cs-wb__status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.cs-wb__status-dot.ok { background: #34d399; box-shadow: 0 0 6px rgba(52, 211, 153, 0.6); }
.cs-wb__status-dot.warn { background: #fbbf24; }

/* ===== 主体布局 ===== */
.cs-wb__body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* ===== 左侧用户列表 ===== */
.cs-wb__sidebar {
  width: 300px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cs-wb__sidebar-title {
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 8px;
}
.cs-wb__badge {
  background: #fbbf24;
  color: #fff;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.cs-wb__sidebar-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
}
.cs-wb__user-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.cs-wb__user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #f9fafb;
}
.cs-wb__user-item:hover { background: #f9fafb; }
.cs-wb__user-item--active { background: #eff6ff; border-left: 3px solid #2563eb; padding-left: 13px; }

.cs-wb__user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}
.cs-wb__user-info { flex: 1; min-width: 0; }
.cs-wb__user-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-wb__user-tag {
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}
.cs-wb__user-sub {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 3px;
}
.cs-wb__user-serving {
  color: #10b981;
}

/* ===== 右侧对话区 ===== */
.cs-wb__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cs-wb__empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}
.cs-wb__empty-icon { font-size: 48px; margin-bottom: 12px; }
.cs-wb__empty-text { font-size: 14px; }

/* 对话标题 */
.cs-wb__chat-title {
  padding: 14px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.cs-wb__chat-name {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.cs-wb__chat-sub {
  font-size: 12px;
  color: #9ca3af;
}

/* 消息列表 */
.cs-wb__chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cs-wb__loading, .cs-wb__no-msg {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 40px 0;
}

.cs-wb__bubble {
  max-width: 70%;
}
.cs-wb__bubble--theirs { align-self: flex-start; }
.cs-wb__bubble--mine { align-self: flex-end; }

.cs-wb__bubble-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
}
.cs-wb__bubble-name { font-size: 12px; color: #6b7280; font-weight: 500; }
.cs-wb__bubble-time { font-size: 11px; color: #9ca3af; }

.cs-wb__bubble-body {
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
.cs-wb__bubble--theirs .cs-wb__bubble-body {
  background: #fff;
  color: #1f2937;
  border: 1px solid #e5e7eb;
  border-top-left-radius: 3px;
}
.cs-wb__bubble--mine .cs-wb__bubble-body {
  background: #2563eb;
  color: #fff;
  border-top-right-radius: 3px;
}

/* 输入区 */
.cs-wb__chat-input {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 14px 24px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.cs-wb__textarea {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.cs-wb__textarea:focus { border-color: #2563eb; }
.cs-wb__textarea:disabled { background: #f9fafb; opacity: 0.6; }

.cs-wb__send-btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.cs-wb__send-btn:hover:not(:disabled) { background: #1d4ed8; }
.cs-wb__send-btn:disabled { background: #9ca3af; cursor: not-allowed; }
</style>
