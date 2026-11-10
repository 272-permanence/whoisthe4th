<script setup lang="ts">
/**
 * @file 流式 TTS 播放器独立组件（MobileChat + PC InteractionView 共用）
 * @author 第八组（成员A）
 * @date 2026-11-10
 * @description 封装 useTtsStream 的 SSE + MediaSource 流式播放逻辑，
 *              暴露简洁的 speak(text) / stop() API。
 *              配合 Avatar.vue 可实现「数字人说 + 嘴型同步」完整交互。
 *
 *              使用示例（MobileChat.vue / PC InteractionView 里）：
 *                <TtsAudioPlayer ref="playerRef" />
 *                <button @click="playerRef.speak('你好')">说</button>
 *                <button @click="playerRef.stop()">停</button>
 */
import { ref, watch } from 'vue';
import { useTtsStream } from '../../composables/useTtsStream';
import Avatar from './Avatar.vue';

/** 组件暴露 API */
const controller = useTtsStream();
const emit = defineEmits<{
  (e: 'started', provider: string): void;
  (e: 'ended'): void;
  (e: 'error', msg: string): void;
}>();

/** 对外暴露的方法 */
defineExpose({
  /** 开始播报 */
  speak(text: string): void {
    controller.speak(text);
  },
  /** 立即停止 */
  stop(): void {
    controller.stop();
  },
  /** 是否正在播报 */
  get isStreaming(): boolean {
    return controller.isStreaming.value;
  },
  /** 口型开合度（0~1），可传给外部 Avatar */
  get mouthOpen(): number {
    return controller.mouthOpen.value;
  },
  /** 当前 provider 名称（edge-tts / mock） */
  get provider(): string {
    return controller.provider.value;
  }
});

// watch 事件透传
watch(controller.isStreaming, (val) => {
  if (val) {
    emit('started', controller.provider.value);
  } else {
    emit('ended');
  }
});

watch(controller.errorMessage, (msg) => {
  if (msg) emit('error', msg);
});
</script>

<template>
  <div class="tts-player">
    <!-- 内嵌 Avatar（breathing 静止 / lip-sync 跟随音频振幅） -->
    <Avatar mode="lip-sync" size="md" :mouth-open="controller.mouthOpen" :is-speaking="controller.isStreaming" />

    <!-- 状态提示 -->
    <div class="tts-player__status" v-if="controller.provider">
      <span class="tts-player__engine">{{ controller.provider }}</span>
      <span class="tts-player__state">
        {{ controller.isStreaming ? '播报中…' : '等待' }}
      </span>
    </div>

    <!-- 停止按钮（仅在播报时显示） -->
    <button v-if="controller.isStreaming" class="tts-player__stop" type="button" @click="controller.stop">
      停止播报
    </button>

    <!-- 错误提示 -->
    <p v-if="controller.errorMessage" class="tts-player__error">{{ controller.errorMessage }}</p>
  </div>
</template>

<style scoped>
.tts-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(148, 197, 255, 0.16);
}

.tts-player__status {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: #8fb6e0;
}

.tts-player__engine {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(148, 197, 255, 0.12);
}

.tts-player__stop {
  margin-top: 6px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
  font-size: 12px;
  cursor: pointer;
}

.tts-player__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
  font-size: 12px;
}
</style>
