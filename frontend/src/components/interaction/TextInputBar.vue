<script setup lang="ts">
/**
 * @file 文字提问输入组件
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 提供文字提问入口与常用问题快捷选项，与语音提问共用同一条「识别 → 回答 → 播报」链路。
 */
import { computed, ref } from 'vue'

/** 组件属性 */
interface Props {
  /** 是否禁用输入（识别或播报中） */
  disabled: boolean
  /** 常用问题快捷选项 */
  presets: string[]
}

/** 组件事件 */
interface Emits {
  /** 提交提问文本 */
  submit: [text: string]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputText = ref('')

/** 提交按钮是否可用 */
const canSubmit = computed(() => !props.disabled && inputText.value.trim().length > 0)

/**
 * 提交当前输入框中的文本
 */
function handleSubmit(): void {
  if (!canSubmit.value) {
    return
  }
  emit('submit', inputText.value.trim())
  inputText.value = ''
}

/**
 * 点击快捷问题直接提问
 * @param question 快捷问题文本
 */
function handlePresetClick(question: string): void {
  if (props.disabled) {
    return
  }
  emit('submit', question)
}
</script>

<template>
  <div class="text-input">
    <div class="text-input__presets">
      <button
        v-for="question in presets"
        :key="question"
        class="text-input__preset"
        type="button"
        :disabled="disabled"
        @click="handlePresetClick(question)"
      >
        {{ question }}
      </button>
    </div>
    <div class="text-input__row">
      <input
        v-model="inputText"
        class="text-input__field"
        type="text"
        placeholder="也可以直接输入想问的问题，例如：西湖有哪些必看景点？"
        :disabled="disabled"
        @keyup.enter="handleSubmit"
      />
      <button class="text-input__submit" type="button" :disabled="!canSubmit" @click="handleSubmit">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.text-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.text-input__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.text-input__preset {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 197, 255, 0.28);
  background: rgba(56, 189, 248, 0.08);
  color: #cfe6ff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.text-input__preset:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
}

.text-input__preset:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.text-input__row {
  display: flex;
  gap: 10px;
}

.text-input__field {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 197, 255, 0.25);
  background: rgba(9, 20, 35, 0.75);
  color: #e8f3ff;
  font-size: 14px;
  outline: none;
}

.text-input__field:focus {
  border-color: #38bdf8;
}

.text-input__field:disabled {
  opacity: 0.6;
}

.text-input__submit {
  padding: 0 22px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #1f6feb, #38bdf8);
  color: #06131f;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.text-input__submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
