<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const modules = [
  { name: 'AI 智能问答', desc: '景区导览问答 · 流式回答 · 引用来源', path: '/qa', color: '#1976d2' },
  { name: '数字人语音交互', desc: '虚拟讲解员 · 语音对话 · 口型同步', path: '/', color: '#7b1fa2', disabled: true },
  { name: '知识库管理', desc: '文档上传 · 向量索引 · 知识增强', path: '/', color: '#388e3c', disabled: true },
  { name: '数据大屏', desc: '情感分析 · 舆情监控 · 可视化大屏', path: '/dashboard', color: '#d84315' },
];
</script>

<template>
  <div class="home">
    <h1>西湖文化 AI 导览系统</h1>
    <p class="subtitle">LLM + RAG + SSE 流式输出 · 大模型应用开发课程项目</p>

    <div class="modules">
      <div
        v-for="m in modules"
        :key="m.name"
        :class="['module-card', { disabled: m.disabled }]"
        @click="!m.disabled && router.push(m.path)"
      >
        <div class="module-title" :style="{ color: m.color }">{{ m.name }}</div>
        <div class="module-desc">{{ m.desc }}</div>
        <div class="module-arrow" v-if="!m.disabled">→</div>
        <div class="module-badge" v-if="m.disabled">开发中</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
  padding: 60px 20px;
  text-align: center;
}

h1 {
  font-size: 32px;
  margin-bottom: 8px;
  color: #1a1a2e;
}

.subtitle {
  color: #666;
  margin-bottom: 48px;
  font-size: 14px;
}

.modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  text-align: left;
}

.module-card {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.module-card:not(.disabled):hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

.module-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f5f5f5;
}

.module-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
}

.module-desc {
  font-size: 13px;
  color: #666;
}

.module-arrow {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: #999;
}

.module-badge {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  background: #ddd;
  color: #666;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
