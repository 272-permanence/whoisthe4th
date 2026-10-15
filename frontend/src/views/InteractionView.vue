<script setup lang="ts">
/**
 * @file 语音交互主页面
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 成员A「多模态语音交互引擎」的端到端编排页面：
 *              语音采集与 VAD 自动断句 → 上传后端语音识别 → 生成回答 → SSE 流式语音合成 →
 *              数字人播报并同步口型。文字提问与语音提问共用同一条链路。
 */
import { computed, ref } from 'vue'
import ConversationList from '../components/interaction/ConversationList.vue'
import DigitalHumanAvatar from '../components/interaction/DigitalHumanAvatar.vue'
import TextInputBar from '../components/interaction/TextInputBar.vue'
import VoiceInputButton from '../components/interaction/VoiceInputButton.vue'
import { transcribeAudio } from '../api/asrTts'
import { useAudioCapture } from '../composables/useAudioCapture'
import { useTtsStream } from '../composables/useTtsStream'
import type { ChatRole, ChatTurn } from '../types/interaction'
import { buildGuideReply } from '../utils/guideReply'

/** 常用问题快捷选项，方便无麦克风时演示 */
const PRESET_QUESTIONS = ['西湖有哪些必看景点？', '雷峰塔有什么历史故事？', '推荐一条两小时的游览路线']

const turns = ref<ChatTurn[]>([])
const isRecognizing = ref(false)
const pipelineError = ref('')

/** 流式语音合成：口型开合度由播放中的音频振幅实时驱动 */
const {
  isStreaming,
  mouthOpen,
  provider,
  errorMessage: ttsError,
  speak,
  stop: stopSpeaking
} = useTtsStream()

/** 语音采集：检测到用户停止说话后自动断句并回调 */
const {
  isRecording,
  vadState,
  level,
  errorMessage: captureError,
  startRecording,
  stopRecording
} = useAudioCapture({ onSpeechEnd: handleSpeechEnd })

/** 需要展示给用户的错误提示，多来源取第一个非空值 */
const displayError = computed(() => pipelineError.value || captureError.value || ttsError.value)

/** 识别与播报期间需要禁用输入控件 */
const isBusy = computed(() => isRecognizing.value || isStreaming.value)

/** 数字人状态文案 */
const avatarStatus = computed(() => {
  if (isStreaming.value) {
    return '正在为你播报…'
  }
  if (isRecognizing.value) {
    return '正在识别你的语音…'
  }
  return '等待你的提问'
})

/**
 * 追加一条对话消息
 * @param role 消息角色
 * @param text 消息文本
 */
function appendTurn(role: ChatRole, text: string): void {
  turns.value.push({
    id: `${Date.now()}-${turns.value.length}`,
    role,
    text,
    createdAt: Date.now()
  })
}

/**
 * 提问：写入对话记录并让数字人播报回答
 * 接入成员B的 LLM 流式接口：边生成边分句，每凑够一句就触发 TTS 播报
 * @param question 用户提问
 */
async function askQuestion(question: string): Promise<void> {
  const trimmed = question.trim()
  if (trimmed === '') {
    pipelineError.value = '请输入有效的问题'
    return
  }
  if (isStreaming.value) {
    stopSpeaking()
  }
  pipelineError.value = ''
  appendTurn('user', trimmed)

  // 先插入一条占位的 assistant 消息，流式更新内容
  const assistantTurnIndex = turns.value.length
  appendTurn('assistant', '…')

  try {
    const fullText = await buildGuideReply(
      trimmed,
      // 每凑够一句就播报
      (sentence) => {
        speak(sentence)
      },
      // 错误处理
      (err) => {
        pipelineError.value = err
      }
    )
    // 流式结束后，把完整文本写入对话记录
    turns.value[assistantTurnIndex].text = fullText
  } catch (error) {
    const msg = error instanceof Error ? error.message : '服务暂时不可用'
    turns.value[assistantTurnIndex].text = `抱歉，${msg}`
    pipelineError.value = msg
  }
}

/**
 * 语音采集结束后的处理：上传识别 → 写入提问 → 触发播报
 * @param wav 编码好的 16kHz 单声道 WAV 录音
 */
async function handleSpeechEnd(wav: Blob): Promise<void> {
  isRecognizing.value = true
  pipelineError.value = ''
  try {
    const result = await transcribeAudio(wav)
    const question = result.text.trim()
    if (question === '') {
      pipelineError.value = '没有识别到有效内容，请再说一次'
      return
    }
    askQuestion(question)
  } catch (error) {
    pipelineError.value = error instanceof Error ? error.message : '语音识别失败'
  } finally {
    isRecognizing.value = false
  }
}
</script>

<template>
  <div class="interaction-page">
    <header class="interaction-page__header">
      <h1 class="interaction-page__title">景区导览 AI 数字人</h1>
      <p class="interaction-page__subtitle">成员A · 多模态语音交互引擎：语音识别 + 流式语音合成 + 口型同步</p>
    </header>
    <section class="interaction">
    <aside class="interaction__avatar">
      <DigitalHumanAvatar :mouth-open="mouthOpen" :is-speaking="isStreaming" />
      <h2 class="interaction__name">数字人导览员 · 小导</h2>
      <p class="interaction__status">{{ avatarStatus }}</p>
      <p class="interaction__engine">语音合成引擎：{{ provider === '' ? '未启动' : provider }}</p>
      <button v-if="isStreaming" class="interaction__stop" type="button" @click="stopSpeaking">
        停止播报
      </button>
    </aside>

    <div class="interaction__console">
      <ConversationList :turns="turns" />
      <p v-if="displayError !== ''" class="interaction__error">{{ displayError }}</p>
      <div class="interaction__controls">
        <VoiceInputButton
          :is-recording="isRecording"
          :is-busy="isRecognizing"
          :level="level"
          :vad-state="vadState"
          @start="startRecording"
          @stop="stopRecording"
        />
        <TextInputBar :disabled="isBusy" :presets="PRESET_QUESTIONS" @submit="askQuestion" />
      </div>
    </div>
    </section>
  </div>
</template>

<style scoped>
.interaction-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.interaction-page__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.interaction-page__title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #eef6ff;
}

.interaction-page__subtitle {
  margin: 0;
  font-size: 13px;
  color: #86a8cd;
}

.interaction {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 20px;
  width: 100%;
  align-items: stretch;
}

.interaction__avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(148, 197, 255, 0.16);
  backdrop-filter: blur(6px);
}

.interaction__name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #eaf4ff;
}

.interaction__status {
  margin: 0;
  font-size: 13px;
  color: #8fb6e0;
}

.interaction__engine {
  margin: 0;
  font-size: 12px;
  color: #6f8fb5;
}

.interaction__stop {
  margin-top: 10px;
  padding: 8px 18px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
  font-size: 13px;
  cursor: pointer;
}

.interaction__console {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(148, 197, 255, 0.14);
}

.interaction__error {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
  font-size: 13px;
}

.interaction__controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 960px) {
  .interaction {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
