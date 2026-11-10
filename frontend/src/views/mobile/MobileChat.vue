<script setup lang="ts">
/**
 * @file 移动端 AI 导览语音聊天页面
 * @author 第八组（成员A）
 * @date 2026-11-10
 * @description 复用成员A的多模态交互引擎（语音采集 + 识别 + LLM + TTS 流式播报），
 *              以移动端紧凑布局呈现：顶部 Avatar 数字人 + 对话气泡列表 + 底部输入区。
 *              替换 D 之前临时挂在 TabBar 上的 PC 端 InteractionView.vue。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Avatar from '../../components/common/Avatar.vue';
import { useAudioCapture } from '../../composables/useAudioCapture';
import { useTtsStream } from '../../composables/useTtsStream';
import { transcribeAudio } from '../../api/asrTts';
import { buildGuideReply } from '../../utils/guideReply';
import { trackAutoBind, trackClick } from '../../utils/track';
import type { ChatRole, ChatTurn } from '../../types/interaction';

/** 常用问题快捷选项 */
const PRESET_QUESTIONS = ['西湖有哪些必看景点？', '雷峰塔有什么历史故事？', '推荐一条两小时游览路线'];

const turns = ref<ChatTurn[]>([]);
const isRecognizing = ref(false);
const pipelineError = ref('');
const inputText = ref('');
/** 对话气泡滚动容器的 ref，用于自动滚到底 */
const listRef = ref<HTMLElement | null>(null);

/** 流式语音合成 */
const {
  isStreaming,
  mouthOpen,
  provider,
  errorMessage: ttsError,
  speak,
  stop: stopSpeaking,
} = useTtsStream();

/** 语音采集 */
const {
  isRecording,
  vadState,
  level,
  errorMessage: captureError,
  startRecording,
  stopRecording,
} = useAudioCapture({ onSpeechEnd: handleSpeechEnd });

const displayError = computed(() => pipelineError.value || captureError.value || ttsError.value);
const isBusy = computed(() => isRecognizing.value || isStreaming.value);

/** 数字人状态文案 */
const avatarStatus = computed(() => {
  if (isStreaming.value) return '正在播报…';
  if (isRecognizing.value) return '正在识别…';
  if (isRecording.value) return vadState.value === 'speech' ? '听到你了…' : '等待说话…';
  return '点按下方按钮，开始聊天';
});

/**
 * 追加一条对话消息
 */
function appendTurn(role: ChatRole, text: string): void {
  turns.value.push({
    id: `${Date.now()}-${turns.value.length}`,
    role,
    text,
    createdAt: Date.now(),
  });
}

/**
 * 对话列表变动时自动滚到底
 */
watch(
  () => turns.value.length,
  async () => {
    await nextTick();
    const el = listRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
);

/**
 * 提问：写入对话记录并让数字人播报回答
 */
async function askQuestion(question: string): Promise<void> {
  const trimmed = question.trim();
  if (!trimmed) {
    pipelineError.value = '请输入有效问题';
    return;
  }
  trackClick('mobile-ask-question', 'mobile-chat', { questionPreview: trimmed.slice(0, 30) });

  if (isStreaming.value) stopSpeaking();
  pipelineError.value = '';
  inputText.value = '';
  appendTurn('user', trimmed);

  const assistantIndex = turns.value.length;
  appendTurn('assistant', '…');

  try {
    const fullText = await buildGuideReply(
      trimmed,
      (sentence) => speak(sentence),
      (err) => { pipelineError.value = err; }
    );
    turns.value[assistantIndex].text = fullText;
  } catch (error) {
    const msg = error instanceof Error ? error.message : '服务暂不可用';
    turns.value[assistantIndex].text = `抱歉，${msg}`;
    pipelineError.value = msg;
  }
}

/**
 * 语音采集结束后的处理
 */
async function handleSpeechEnd(wav: Blob): Promise<void> {
  isRecognizing.value = true;
  pipelineError.value = '';
  try {
    const result = await transcribeAudio(wav);
    const question = result.text.trim();
    if (!question) {
      pipelineError.value = '没听清，请再说一次';
      return;
    }
    askQuestion(question);
  } catch (error) {
    pipelineError.value = error instanceof Error ? error.message : '语音识别失败';
  } finally {
    isRecognizing.value = false;
  }
}

/**
 * 表单提交（文字输入）
 */
function onSubmit(): void {
  askQuestion(inputText.value);
}

onMounted(() => {
  trackAutoBind();
});
</script>

<template>
  <div class="mobile-chat">
    <!-- 顶部 Avatar 横条 -->
    <header class="mobile-chat__header">
      <div class="mobile-chat__avatar-wrap">
        <Avatar
          mode="lip-sync"
          size="sm"
          :mouth-open="mouthOpen"
          :is-speaking="isStreaming"
        />
      </div>
      <div class="mobile-chat__meta">
        <span class="mobile-chat__name">小导 · 数字人</span>
        <span class="mobile-chat__status">{{ avatarStatus }}</span>
        <span v-if="provider" class="mobile-chat__engine">语音引擎：{{ provider }}</span>
      </div>
      <button
        v-if="isStreaming"
        class="mobile-chat__stop"
        type="button"
        @click="stopSpeaking"
      >■ 停止</button>
    </header>

    <!-- 对话气泡列表 -->
    <section ref="listRef" class="mobile-chat__list">
      <div
        v-for="turn in turns"
        :key="turn.id"
        :class="['mobile-chat__bubble', turn.role === 'user' ? 'mobile-chat__bubble--user' : 'mobile-chat__bubble--assistant']"
      >
        {{ turn.text }}
      </div>

      <!-- 空态提示 -->
      <div v-if="turns.length === 0" class="mobile-chat__empty">
        <p class="mobile-chat__empty-title">嗨，我是小导</p>
        <p class="mobile-chat__empty-sub">按下方麦克风说话，或点选快捷问题</p>
        <div class="mobile-chat__presets">
          <button
            v-for="q in PRESET_QUESTIONS"
            :key="q"
            type="button"
            class="mobile-chat__preset-chip"
            :disabled="isBusy"
            @click="askQuestion(q)"
          >{{ q }}</button>
        </div>
      </div>
    </section>

    <!-- 错误提示条 -->
    <p v-if="displayError" class="mobile-chat__error">{{ displayError }}</p>

    <!-- 底部输入区 -->
    <footer class="mobile-chat__input">
      <!-- 语音录音按钮（大号圆形，移动端主交互） -->
      <button
        :class="['mobile-chat__mic', isRecording ? 'mobile-chat__mic--recording' : '']"
        type="button"
        :disabled="isBusy && !isRecording"
        @touchstart.prevent="startRecording"
        @touchend.prevent="stopRecording"
        @mousedown.prevent="startRecording"
        @mouseup.prevent="stopRecording"
      >
        <span v-if="!isRecording">🎤</span>
        <span v-else class="mobile-chat__mic-pulse">●</span>
      </button>

      <!-- 实时音量条（仅录音时显示） -->
      <div v-if="isRecording" class="mobile-chat__level">
        <div class="mobile-chat__level-bar" :style="{ width: `${level * 100}%` }" />
      </div>

      <!-- 文字输入 -->
      <form class="mobile-chat__text-form" @submit.prevent="onSubmit">
        <input
          v-model="inputText"
          class="mobile-chat__text-input"
          type="text"
          placeholder="输入问题…"
          :disabled="isBusy"
        />
        <button
          class="mobile-chat__send"
          type="submit"
          :disabled="isBusy || !inputText.trim()"
        >发送</button>
      </form>
    </footer>
  </div>
</template>

<style scoped>
/* ===== 整体容器 ===== */
.mobile-chat {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f7f8fa;
}

/* ===== 顶部 Avatar 横条 ===== */
.mobile-chat__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1989fa 0%, #0f6dd8 100%);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(25, 137, 250, 0.25);
}

.mobile-chat__avatar-wrap {
  flex-shrink: 0;
  /* Avatar size="sm" 宽度 120px，这里缩到 ~56px 显示 */
  transform: scale(0.46);
  transform-origin: left center;
  width: 56px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.4);
}

.mobile-chat__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.mobile-chat__name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.mobile-chat__status {
  font-size: 12px;
  opacity: 0.9;
}

.mobile-chat__engine {
  font-size: 11px;
  opacity: 0.7;
}

.mobile-chat__stop {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 12px;
}

/* ===== 对话列表 ===== */
.mobile-chat__list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 气泡基础样式 */
.mobile-chat__bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}

.mobile-chat__bubble--user {
  align-self: flex-end;
  background: #1989fa;
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 6px rgba(25, 137, 250, 0.2);
}

.mobile-chat__bubble--assistant {
  align-self: flex-start;
  background: #fff;
  color: #333;
  border: 1px solid #ebedf0;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

/* 空态 */
.mobile-chat__empty {
  padding: 40px 20px 20px;
  text-align: center;
  color: #969799;
}

.mobile-chat__empty-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #323233;
}

.mobile-chat__empty-sub {
  margin: 0 0 20px;
  font-size: 13px;
}

.mobile-chat__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.mobile-chat__preset-chip {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid #1989fa;
  background: #fff;
  color: #1989fa;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.mobile-chat__preset-chip:active {
  background: #1989fa;
  color: #fff;
}

.mobile-chat__preset-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 错误提示 ===== */
.mobile-chat__error {
  margin: 0 14px 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(237, 64, 64, 0.1);
  border: 1px solid rgba(237, 64, 64, 0.3);
  color: #ed4014;
  font-size: 12px;
  text-align: center;
}

/* ===== 底部输入区 ===== */
.mobile-chat__input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #ebedf0;
  position: sticky;
  bottom: 0;
  z-index: 10;
}

/* 麦克风按钮（大号圆形） */
.mobile-chat__mic {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: #1989fa;
  color: #fff;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(25, 137, 250, 0.4);
  transition: transform 0.1s, background 0.2s;
  touch-action: none;
}

.mobile-chat__mic:active {
  transform: scale(0.93);
}

.mobile-chat__mic:disabled {
  background: #c8c9cc;
  box-shadow: none;
  cursor: not-allowed;
}

.mobile-chat__mic--recording {
  background: #ed4014;
  animation: mic-pulse 1.2s ease-in-out infinite;
}

.mobile-chat__mic-pulse {
  display: inline-block;
  animation: blink 0.6s ease-in-out infinite;
}

@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 3px 10px rgba(237, 64, 20, 0.4); }
  50%      { box-shadow: 0 3px 20px rgba(237, 64, 20, 0.7); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}

/* 音量条 */
.mobile-chat__level {
  position: absolute;
  bottom: 70px;
  left: 14px;
  width: 52px;
  height: 4px;
  border-radius: 2px;
  background: rgba(237, 64, 20, 0.2);
  overflow: hidden;
}

.mobile-chat__level-bar {
  height: 100%;
  background: #ed4014;
  border-radius: 2px;
  transition: width 0.08s linear;
}

/* 文字输入 */
.mobile-chat__text-form {
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.mobile-chat__text-input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid #ebedf0;
  background: #f7f8fa;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.mobile-chat__text-input:focus {
  border-color: #1989fa;
  background: #fff;
}

.mobile-chat__text-input:disabled {
  opacity: 0.5;
}

.mobile-chat__send {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: 999px;
  border: none;
  background: #1989fa;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.mobile-chat__send:active {
  background: #0f6dd8;
}

.mobile-chat__send:disabled {
  background: #c8c9cc;
  cursor: not-allowed;
}
</style>
