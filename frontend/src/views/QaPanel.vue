<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

interface SourceReference {
  /** 文档名称 */
  docName: string;
  /** 引用片段 */
  snippet: string;
  /** 相似度得分（0~1） */
  score?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  /** RAG 引用来源，接入向量检索后填充 */
  sources?: SourceReference[];
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
            // RAG 引用来源（等后端接入向量检索后返回）
            if (json.sources && Array.isArray(json.sources)) {
              aiMsg.sources = json.sources;
            }
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
        <!-- RAG 引用来源展示 -->
        <div v-if="msg.sources && msg.sources.length > 0" class="sources">
          <div class="sources-title">参考来源</div>
          <div v-for="(src, j) in msg.sources" :key="j" class="source-item">
            <div class="source-doc">{{ src.docName }}</div>
            <div class="source-snippet">{{ src.snippet }}</div>
            <div v-if="src.score !== undefined" class="source-score">相似度: {{ (src.score * 100).toFixed(1) }}%</div>
          </div>
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
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  background: var(--color-bg);
  font-family: var(--font-sans);
  color: var(--color-text);
}

h1 {
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
  margin-bottom: var(--space-4);
  color: var(--color-text);
  letter-spacing: 0.02em;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
  background: var(--color-surface);
}

.message {
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-body);
  line-height: 1.7;
}

.message.user {
  background: var(--color-primary-soft);
  margin-left: 40px;
  color: var(--color-text);
}

.message.assistant {
  background: var(--color-bg);
  margin-right: 40px;
  border: 1px solid var(--color-border);
}

.message-role {
  font-size: var(--text-meta);
  color: var(--color-text-3);
  margin-bottom: 4px;
  font-weight: 500;
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor {
  animation: blink 1s infinite;
  color: var(--color-primary);
  font-weight: 700;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.empty-tip {
  text-align: center;
  color: var(--color-text-3);
  padding: var(--space-12);
  font-size: var(--text-body);
}

.error-banner {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-3);
  font-size: var(--text-body);
  border: 1px solid #f3d4d0;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  resize: none;
  font-size: var(--text-body);
  box-sizing: border-box;
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-surface);
  min-height: 60px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
textarea::placeholder {
  color: var(--color-text-3);
}

textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.btn {
  padding: var(--space-2) var(--space-6);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-body);
  font-weight: 500;
  font-family: var(--font-sans);
  transition: background 0.15s, box-shadow 0.15s;
}

.btn.send {
  background: var(--color-primary);
  color: #fff;
}
.btn.send:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.btn.send:disabled {
  background: var(--color-text-3);
  cursor: not-allowed;
  opacity: 0.55;
}

.btn.cancel {
  background: var(--color-danger);
  color: #fff;
}
.btn.cancel:hover {
  background: #b91c1c;
}

/* RAG 引用来源样式 */
.sources {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}

.sources-title {
  font-size: var(--text-meta);
  color: var(--color-text-2);
  margin-bottom: var(--space-2);
  font-weight: 600;
}

.source-item {
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--text-caption);
  border: 1px solid var(--color-border);
}

.source-doc {
  color: var(--color-primary);
  font-weight: 500;
  margin-bottom: 4px;
}

.source-snippet {
  color: var(--color-text-2);
  line-height: 1.5;
}

.source-score {
  color: var(--color-text-3);
  font-size: var(--text-meta);
  margin-top: 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
