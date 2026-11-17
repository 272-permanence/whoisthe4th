<script setup lang="ts">
/**
 * @file 对话列表组件
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 展示用户提问与数字人回答的对话记录，新消息到达时自动滚动到底部。
 */
import { nextTick, ref, watch } from 'vue'
import type { ChatTurn } from '../../types/interaction'

/** 组件属性 */
interface Props {
  /** 对话消息列表 */
  turns: ChatTurn[]
}

const props = defineProps<Props>()

const listRef = ref<HTMLDivElement | null>(null)

/**
 * 转义 HTML 特殊字符，避免 v-html 被模型输出注入
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 轻量 Markdown 渲染：加粗、行内代码、标题、无序列表
 * 保留原始换行（由 CSS white-space: pre-wrap 呈现），避免回答挤成一整段
 * @param text 模型返回的原始文本
 * @returns 可直接用于 v-html 的 HTML 片段
 */
function renderText(text: string): string {
  return escapeHtml(text)
    // **加粗**
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // `行内代码`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // ### 标题
    .replace(/^#{1,6}\s+(.+)$/gm, '<strong class="md-heading">$1</strong>')
    // - 列表项统一为圆点
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    // 兜底：流式输出时可能残留未闭合的 ** 标记
    .replace(/\*\*/g, '')
}

watch(
  () => props.turns.length,
  async () => {
    await nextTick()
    const element = listRef.value
    if (element !== null) {
      element.scrollTop = element.scrollHeight
    }
  }
)
</script>

<template>
  <div ref="listRef" class="conversation">
    <p v-if="turns.length === 0" class="conversation__empty">
      还没有对话记录，点击麦克风说话，或直接输入问题开始体验数字人导览。
    </p>
    <div
      v-for="turn in turns"
      :key="turn.id"
      class="conversation__item"
      :class="turn.role === 'user' ? 'conversation__item--user' : 'conversation__item--assistant'"
    >
      <span class="conversation__role">{{ turn.role === 'user' ? '我' : '数字人小导' }}</span>
      <div class="conversation__text" v-html="renderText(turn.text)"></div>
    </div>
  </div>
</template>

<style scoped>
.conversation {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(9, 20, 35, 0.55);
  border: 1px solid rgba(148, 197, 255, 0.15);
}

.conversation__empty {
  margin: auto;
  max-width: 260px;
  text-align: center;
  font-size: 13px;
  line-height: 1.8;
  color: #8aa6c8;
}

.conversation__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
}

.conversation__item--user {
  align-self: flex-end;
  align-items: flex-end;
}

.conversation__item--assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.conversation__role {
  font-size: 12px;
  color: #7fa4cc;
}

.conversation__text {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.75;
  /* 保留模型输出中的换行与空行，避免整段文字挤在一起 */
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation__text :deep(strong) {
  color: #eaf6ff;
  font-weight: 600;
}

.conversation__text :deep(.md-heading) {
  display: inline-block;
  margin: 6px 0 2px;
  font-size: 15px;
}

.conversation__text :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(148, 197, 255, 0.16);
  font-size: 13px;
}

.conversation__item--user .conversation__text {
  background: linear-gradient(135deg, #1f6feb, #2f9bdd);
  color: #f4f9ff;
}

.conversation__item--assistant .conversation__text {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.28);
  color: #d7ebff;
}
</style>
