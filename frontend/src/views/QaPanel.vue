<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const messages = ref<Message[]>([]);
const inputText = ref('');
const isLoading = ref(false);
const errorMsg = ref('');

// 当前流式控制器，用于取消请求
let currentController: AbortController | null = null;

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  errorMsg.value = '';
  inputText.value = '';
  isLoading.value = true;

  // 添加用户消息
  messages.value.push({ role: 'user', content: text });

  // 添加 AI 占位消息（流式更新）
  const aiMsg: Message = { role: 'assistant', content: '', streaming: true };
  messages.value.push(aiMsg);

  try {
    currentController = new AbortController();

    const response = await fetch(`${API_BASE}/api/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
      signal: currentController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按 SSE 事件边界解析
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const eventStr = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);

        if (!eventStr || eventStr.startsWith(':')) continue;

        const lines = eventStr.split('\n');
        const eventLine = lines.find(l => l.startsWith('event:'));
        const dataLine = lines.find(l => l.startsWith('data:'));

        if (!eventLine || !dataLine) continue;

        const event = eventLine.slice(6).trim();
        const data = dataLine.slice(5).trim();

        try {
          const json = JSON.parse(data);

          if (event === 'token') {
            // 流式追加内容
            aiMsg.content += json.content;
          } else if (event === 'done') {
            // 流结束，如果有 fullContent 则以它为准
            if (json.fullContent) aiMsg.content = json.fullContent;
            aiMsg.streaming = false;
          } else if (event === 'error') {
            errorMsg.value = json.message || '服务出错';
            aiMsg.content = '抱歉，服务暂时不可用，请稍后重试。';
            aiMsg.streaming = false;
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动取消
      aiMsg.content += '\n\n[已取消]';
    } else {
      errorMsg.value = err instanceof Error ? err.message : '网络错误';
      aiMsg.content = '网络连接失败，请检查后端服务是否启动。';
    }
    aiMsg.streaming = false;
  } finally {
    isLoading.value = false;
    currentController = null;
  }
}

function cancelRequest() {
  if (currentController) {
    currentController.abort();
  }
}

onUnmounted(() => {
  cancelRequest();
});
</script>

<template>
  <div class="qa-panel">
    <h1>景区导览 AI 问答</h1>

    <!-- 消息列表 -->
    <div class="message-list">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        :class="['message', msg.role]"
      >
        <div class="message-role">{{ msg.role === 'user' ? '你' : 'AI 导览员' }}</div>
        <div class="message-content">
          <span v-if="msg.streaming" class="cursor">▋</span>{{ msg.content }}
        </div>
      </div>

      <div v-if="messages.length === 0" class="empty-tip">
        试着问我：西湖十景是哪十景？
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="error-banner">
      {{ errorMsg }}
    </div>

    <!-- 输入区 -->
    <div class="input-area">
      <textarea
        v-model="inputText"
        placeholder="输入你的问题..."
        rows="2"
        :disabled="isLoading"
        @keydown.enter.exact.prevent="sendMessage"
      />
      <div class="input-actions">
        <button v-if="isLoading" class="btn cancel" @click="cancelRequest">
          停止
        </button>
        <button
          v-else
          class="btn send"
          :disabled="!inputText.trim()"
          @click="sendMessage"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qa-panel {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}

h1 {
  font-size: 20px;
  margin-bottom: 16px;
  color: #333;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fafafa;
}

.message {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
}

.message.user {
  background: #e3f2fd;
  margin-left: 40px;
}

.message.assistant {
  background: #fff;
  margin-right: 40px;
  border: 1px solid #e0e0e0;
}

.message-role {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.message-content {
  white-space: pre-wrap;
  line-height: 1.6;
  word-break: break-word;
}

.cursor {
  animation: blink 1s infinite;
  color: #1976d2;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.empty-tip {
  text-align: center;
  color: #999;
  padding: 40px;
  font-size: 14px;
}

.error-banner {
  background: #ffebee;
  color: #c62828;
  padding: 10px 16px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 14px;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  resize: none;
  font-size: 14px;
  box-sizing: border-box;
}

textarea:focus {
  outline: none;
  border-color: #1976d2;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 8px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn.send {
  background: #1976d2;
  color: #fff;
}

.btn.send:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn.cancel {
  background: #f44336;
  color: #fff;
}
</style>
