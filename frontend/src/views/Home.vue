<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { listPublishedContent, resolveImageUrl, type ContentItem } from '../api/content';

const router = useRouter();

const carousel = ref<ContentItem[]>([]);
const announcements = ref<ContentItem[]>([]);
const loading = ref(true);
const activeSlide = ref(0);

// 核心功能模块（未来可从 content/scenic 拉，当前保持前端导航用）
const modules: { name: string; desc: string; path: string; color: string; icon: string; disabled?: boolean }[] = [
  { name: 'AI 智能问答', desc: '景区导览问答 · 流式回答 · 引用来源', path: '/qa', color: '#1976d2', icon: '💬' },
  { name: '数字人语音交互', desc: '虚拟讲解员 · 语音对话 · 口型同步', path: '/interaction', color: '#7b1fa2', icon: '🎤' },
  { name: '数据大屏', desc: '情感分析 · 舆情监控 · 可视化大屏', path: '/dashboard', color: '#d84315', icon: '📊' }
];

async function loadContent() {
  loading.value = true;
  try {
    const [c, a] = await Promise.all([
      listPublishedContent('carousel').catch(() => []),
      listPublishedContent('announcement').catch(() => [])
    ]);
    carousel.value = c;
    announcements.value = a;
  } finally { loading.value = false; }
}

onMounted(loadContent);
</script>

<template>
  <div class="home">
    <!-- 轮播 -->
    <div v-if="carousel.length" class="carousel">
      <div
        v-for="(c, i) in carousel"
        :key="c.id"
        v-show="i === activeSlide"
        class="slide"
        :style="c.image_url ? { backgroundImage: `url(${resolveImageUrl(c.image_url)})` } : {}"
      >
        <div class="slide-overlay"></div>
        <div class="slide-text">
          <h2>{{ c.title }}</h2>
          <p v-if="c.subtitle">{{ c.subtitle }}</p>
        </div>
      </div>
      <div class="dots">
        <button v-for="(_, i) in carousel" :key="i" :class="{ active: i === activeSlide }" @click="activeSlide = i" />
      </div>
    </div>

    <!-- 公告 -->
    <div v-if="announcements.length" class="announcement">
      <span class="ann-icon">📢</span>
      <div class="ann-text">
        <strong>{{ announcements[0].title }}</strong>
        <span v-if="announcements[0].content">：{{ announcements[0].content }}</span>
      </div>
    </div>

    <h1>西湖文化 AI 导览系统</h1>
    <p class="subtitle">LLM + RAG + SSE 流式输出 · 大模型应用开发课程项目</p>

    <div class="modules">
      <div
        v-for="m in modules"
        :key="m.name"
        :class="['module-card', { disabled: m.disabled }]"
        @click="!m.disabled && router.push(m.path)"
      >
        <div class="module-icon">{{ m.icon }}</div>
        <div class="module-title" :style="{ color: m.color }">{{ m.name }}</div>
        <div class="module-desc">{{ m.desc }}</div>
        <div class="module-arrow" v-if="!m.disabled">→</div>
        <div class="module-badge" v-if="m.disabled">开发中</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home { max-width: 900px; margin: 0 auto; padding: 40px 20px 60px; text-align: center; }
h1 { font-size: 32px; margin: 20px 0 8px; color: #1a1a2e; }
.subtitle { color: #666; margin-bottom: 36px; font-size: 14px; }

/* 轮播 */
.carousel { position: relative; width: 100%; height: 280px; border-radius: 14px; overflow: hidden; margin-bottom: 24px; }
.slide { position: absolute; inset: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); background-size: cover; background-position: center; }
.slide-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.5), transparent); }
.slide-text { position: absolute; bottom: 24px; left: 24px; right: 24px; text-align: left; color: #fff; z-index: 2; }
.slide-text h2 { margin: 0 0 4px; font-size: 22px; }
.slide-text p { margin: 0; font-size: 14px; opacity: 0.9; }
.dots { position: absolute; bottom: 10px; right: 14px; display: flex; gap: 6px; z-index: 3; }
.dots button { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.5); border: none; cursor: pointer; padding: 0; }
.dots button.active { background: #fff; }

/* 公告 */
.announcement {
  background: #fff7e6; border-left: 4px solid #faad14;
  padding: 10px 16px; border-radius: 6px; margin-bottom: 24px;
  display: flex; gap: 10px; align-items: flex-start; text-align: left;
}
.ann-icon { font-size: 18px; }
.ann-text { font-size: 13px; color: #555; line-height: 1.5; }
.ann-text strong { color: #333; }

/* 功能模块 */
.modules { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; text-align: left; }
.module-card { border: 1px solid #e0e0e0; border-radius: 12px; padding: 24px; cursor: pointer; transition: all 0.2s; position: relative; background: #fff; }
.module-card:not(.disabled):hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); }
.module-card.disabled { opacity: 0.5; cursor: not-allowed; background: #f5f5f5; }
.module-icon { font-size: 28px; margin-bottom: 8px; }
.module-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.module-desc { font-size: 13px; color: #666; }
.module-arrow { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); font-size: 20px; color: #999; }
.module-badge { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); background: #ddd; color: #666; font-size: 12px; padding: 2px 8px; border-radius: 4px; }
</style>
