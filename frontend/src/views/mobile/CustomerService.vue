<script setup lang="ts">
/**
 * @file 用户端：在线客服聊天页面
 * @author 第八组
 * @date 2026-11-17
 * @description 移动端客服聊天窗口，自动匿名连接，Socket.IO namespace /cs。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCsSocket } from '../../composables/useCsSocket';

const router = useRouter();

const {
  status,
  messages,
  connect,
  disconnect,
  userSend,
} = useCsSocket();

const inputText = ref('');
const joinError = ref('');
const listRef = ref<HTMLElement | null>(null);
const joined = ref(false);

/** 连接状态文案 */
const statusText = computed(() => {
  switch (status.value) {
    case 'connecting': return '连接中…';
    case 'connected': return '在线客服';
    case 'disconnected': return '已断开，正在重连';
    case 'error': return '连接异常，点击重试';
    default: return '准备连接';
  }
});

/** 当前是否可以发送 */
const canSend = computed(() => status.value === 'connected' && joined.value);

/**
 * 自动匿名连接（用匿名昵称，不强制输入）
 */
async function autoJoin(): Promise<void> {
  joinError.value = '';
  try {
    await connect('user', { nickname: '访客' });
    joined.value = true;
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : '连接失败';
  }
}

/**
 * 发送消息
 */
function onSend(): void {
  const text = inputText.value.trim();
  if (!text || !canSend.value) return;

  userSend(text);
  inputText.value = '';
}

/** 消息追加时自动滚动到底 */
watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

function goBack(): void {
  router.back();
}

onMounted(() => {
  void autoJoin();
});

onBeforeUnmount(() => {
  disconnect();
});
</script>

<template>
  <div class="cs-user">
    <!-- 顶部栏 -->
    <header class="cs-user__header">
      <button class="cs-user__back" @click="goBack">←</button>
      <div class="cs-user__meta">
        <span class="cs-user__title">在线客服</span>
        <span class="cs-user__status">
          <span
            :class="['cs-user__dot', status === 'connected' ? 'cs-user__dot--ok' : 'cs-user__dot--warn']"
          />
          {{ statusText }}
        </span>
      </div>
    </header>

    <!-- 连接失败提示 -->
    <div v-if="joinError" class="cs-user__join-error">
      <span>{{ joinError }}</span>
      <button class="cs-user__retry" @click="autoJoin">重试</button>
    </div>

    <!-- 聊天区 -->
    <section ref="listRef" class="cs-user__list">
      <!-- 空态 -->
      <div v-if="messages.length === 0 && joined" class="cs-user__empty">
        <p class="cs-user__empty-title">👋 你好</p>
        <p class="cs-user__empty-sub">请描述你的问题，客服会尽快回复</p>
      </div>

      <template v-for="msg in messages" :key="msg.id">
        <!-- 系统消息（客服接入/离开通知） -->
        <div v-if="msg.senderId.startsWith('sys-')" class="cs-user__system-wrap">
          <span class="cs-user__system">{{ msg.content }}</span>
        </div>
        <!-- 普通消息 -->
        <div
          v-else
          :class="['cs-user__bubble', msg.role === 'user' ? 'cs-user__bubble--me' : 'cs-user__bubble--them']"
        >
          <div class="cs-user__bubble-text">{{ msg.content }}</div>
          <div class="cs-user__bubble-time">
            {{ new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </div>
      </template>
    </section>

    <!-- 底部输入 -->
    <footer class="cs-user__input">
      <input
        v-model="inputText"
        class="cs-user__text"
        type="text"
        placeholder="请输入问题…"
        :disabled="!canSend"
        maxlength="500"
        @keyup.enter="onSend"
      />
      <button
        class="cs-user__send"
        :disabled="!canSend || !inputText.trim()"
        @click="onSend"
      >发送</button>
    </footer>
  </div>
</template>

<style scoped>
.cs-user {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f7f8fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
}

/* ===== 顶部栏 ===== */
.cs-user__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ff976a 0%, #ff6b35 100%);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(255, 107, 53, 0.25);
}
.cs-user__back {
  background: none;
  border: none;
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.cs-user__meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.cs-user__title {
  font-size: 16px;
  font-weight: 600;
}
.cs-user__status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  opacity: 0.9;
}
.cs-user__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.cs-user__dot--ok { background: #34d399; box-shadow: 0 0 6px rgba(52, 211, 153, 0.6); }
.cs-user__dot--warn { background: #fbbf24; }

/* ===== 连接错误提示 ===== */
.cs-user__join-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(237, 64, 64, 0.1);
  border-bottom: 1px solid rgba(237, 64, 64, 0.3);
  color: #c53030;
  font-size: 13px;
}
.cs-user__retry {
  padding: 4px 12px;
  border: 1px solid #c53030;
  border-radius: 999px;
  background: transparent;
  color: #c53030;
  font-size: 12px;
  cursor: pointer;
}

/* ===== 消息列表 ===== */
.cs-user__list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 气泡 */
.cs-user__bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 14px;
  word-break: break-word;
}
.cs-user__bubble--me {
  align-self: flex-end;
  background: linear-gradient(135deg, #ff976a 0%, #ff6b35 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.cs-user__bubble--them {
  align-self: flex-start;
  background: #fff;
  color: #1f2937;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}
.cs-user__bubble-text {
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.cs-user__bubble-time {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 6px;
  text-align: right;
}
.cs-user__bubble--them .cs-user__bubble-time { text-align: left; }

/* 系统消息 */
.cs-user__system-wrap {
  align-self: center;
}
.cs-user__system {
  display: inline-block;
  padding: 4px 12px;
  font-size: 12px;
  color: #6b7280;
  background: #e5e7eb;
  border-radius: 999px;
}

/* 空态 */
.cs-user__empty {
  padding: 80px 20px;
  text-align: center;
}
.cs-user__empty-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}
.cs-user__empty-sub {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

/* ===== 底部输入 ===== */
.cs-user__input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #e5e7eb;
  position: sticky;
  bottom: 0;
}
.cs-user__text {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  font-size: 15px;
  outline: none;
  color: #1f2937;
  transition: border-color 0.2s, background 0.2s;
}
.cs-user__text::placeholder {
  color: #9ca3af;
}
.cs-user__text:focus { border-color: #ff6b35; background: #fff; }
.cs-user__text:disabled { opacity: 0.55; }

.cs-user__send {
  flex-shrink: 0;
  padding: 10px 18px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff976a 0%, #ff6b35 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.cs-user__send:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
