<script setup lang="ts">
/**
 * @file 语音输入按钮组件
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 提供「点击说话」入口：录音中显示实时电平与 VAD 状态提示，
 *              检测到用户停止说话后由上层自动断句提交，无需手动停止。
 */
import { computed } from 'vue'
import type { VadState } from '../../types/interaction'

/** 组件属性 */
interface Props {
  /** 是否正在录音 */
  isRecording: boolean
  /** 是否正在识别语音（识别期间禁止再次录音） */
  isBusy: boolean
  /** 实时音量电平 0~1 */
  level: number
  /** VAD 状态 */
  vadState: VadState
}

/** 组件事件 */
interface Emits {
  /** 用户点击开始录音 */
  start: []
  /** 用户点击停止录音 */
  stop: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/** 按钮状态文案 */
const statusText = computed(() => {
  if (props.isBusy) {
    return '正在识别语音…'
  }
  if (!props.isRecording) {
    return '点击麦克风，直接开口提问'
  }
  return props.vadState === 'speech' ? '正在聆听…说完会自动提交' : '请开始说话…'
})

/** 电平条宽度百分比 */
const levelPercent = computed(() => `${Math.round(props.level * 100)}%`)

/** 点击处理：录音中再次点击表示手动停止 */
function handleClick(): void {
  if (props.isBusy) {
    return
  }
  if (props.isRecording) {
    emit('stop')
    return
  }
  emit('start')
}
</script>

<template>
  <div class="voice-input">
    <button
      class="voice-input__button"
      :class="{ 'voice-input__button--recording': isRecording }"
      type="button"
      :disabled="isBusy"
      @click="handleClick"
    >
      <span class="voice-input__icon" :style="{ transform: `scale(${1 + level * 0.25})` }">🎙️</span>
    </button>
    <p class="voice-input__status">{{ statusText }}</p>
    <div class="voice-input__meter">
      <div class="voice-input__meter-fill" :style="{ width: levelPercent }" />
    </div>
  </div>
</template>

<style scoped>
.voice-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.voice-input__button {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid rgba(148, 197, 255, 0.35);
  background: linear-gradient(160deg, #16324f, #0d1e33);
  color: #e8f3ff;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.voice-input__button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(31, 111, 235, 0.35);
}

.voice-input__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.voice-input__button--recording {
  border-color: #38bdf8;
  box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.18);
}

.voice-input__icon {
  display: block;
  transition: transform 0.08s linear;
}

.voice-input__status {
  margin: 0;
  font-size: 13px;
  color: #a8c4e8;
}

.voice-input__meter {
  width: 160px;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 197, 255, 0.15);
  overflow: hidden;
}

.voice-input__meter-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #7dd3fc);
  transition: width 0.08s linear;
}
</style>
