<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { listPublishedContent, resolveImageUrl, type ContentItem } from '../api/content';
import { getCachedToken, getCachedUser, logout } from '../api/auth';

const router = useRouter();

const carousel = ref<ContentItem[]>([]);
const announcements = ref<ContentItem[]>([]);
const loading = ref(true);
const activeSlide = ref(0);

const isLoggedIn = computed(() => !!getCachedToken());
const currentUser = computed(() => getCachedUser());

function handleLogout() {
  logout();
  router.replace('/login');
}

// 核心功能模块：颜色取自 tokens.css 青绿体系
const modules: { name: string; desc: string; path: string; accent: string; accentSoft: string; icon: string; disabled?: boolean }[] = [
  {
    name: 'AI 智能问答',
    desc: '景区导览问答 · 流式回答 · 引用来源',
    path: '/qa',
    accent: 'var(--color-primary)',
    accentSoft: '#d4ebe6',
    icon: '💬'
  },
  {
    name: '数字人语音交互',
    desc: '虚拟讲解员 · 语音对话 · 口型同步',
    path: '/interaction',
    accent: '#0d9488',
    accentSoft: '#c9e4de',
    icon: '🎤'
  },
  {
    name: '数据大屏',
    desc: '情感分析 · 舆情监控 · 可视化大屏',
    path: '/dashboard',
    accent: '#14b8a6',
    accentSoft: '#c8ebe3',
    icon: '📊'
  }
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
  } finally {
    loading.value = false;
  }
}

onMounted(loadContent);
</script>

<template>
  <!-- 顶部导航条 -->
  <nav class="top-nav">
    <div class="nav-inner">
      <div class="nav-brand" @click="router.push('/')">
        <span class="nav-logo">西湖</span>
        <span class="nav-name">西湖文化 AI 导览</span>
      </div>
      <div class="nav-right">
        <template v-if="isLoggedIn">
          <button v-if="currentUser?.role === 'admin'" class="nav-link" @click="router.push('/admin')">管理后台</button>
          <button class="nav-link" @click="router.push('/profile')">
            <span class="nav-avatar">{{ (currentUser?.nickname || currentUser?.username || 'U').charAt(0).toUpperCase() }}</span>
            个人中心
          </button>
          <button class="nav-logout" @click="handleLogout">退出</button>
        </template>
        <template v-else>
          <button class="nav-login" @click="router.push('/login')">登录</button>
        </template>
      </div>
    </div>
  </nav>

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

    <h1 class="page-title">西湖文化 AI 导览系统</h1>
    <p class="subtitle">LLM + RAG + SSE 流式输出 · 大模型应用开发课程项目</p>

    <div class="modules">
      <div
        v-for="m in modules"
        :key="m.name"
        :class="['module-card', { disabled: m.disabled }]"
        @click="!m.disabled && router.push(m.path)"
      >
        <div class="module-icon" :style="{ background: m.accentSoft, color: m.accent }">{{ m.icon }}</div>
        <div class="module-title" :style="{ color: m.accent }">{{ m.name }}</div>
        <div class="module-desc">{{ m.desc }}</div>
        <div class="module-arrow" v-if="!m.disabled">→</div>
        <div class="module-badge" v-if="m.disabled">开发中</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 顶部导航条 ---------- */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
}
.nav-inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 var(--space-6);
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.nav-logo {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.05em;
}
.nav-name {
  font-family: var(--font-serif);
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--color-text);
}
.nav-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.nav-link {
  background: none;
  border: none;
  font-family: var(--font-sans);
  font-size: var(--text-caption);
  color: var(--color-text-2);
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 100px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s;
}
.nav-link:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.nav-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.nav-login {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 100px;
  padding: 8px 20px;
  font-family: var(--font-sans);
  font-size: var(--text-caption);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.nav-login:hover { background: var(--color-primary-hover); }
.nav-logout {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 100px;
  padding: 6px 14px;
  font-family: var(--font-sans);
  font-size: var(--text-caption);
  color: var(--color-text-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-logout:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: var(--color-danger);
}

/* 首页容器 */
.home {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-12) var(--space-6) var(--space-12);
  text-align: center;
  background: var(--color-bg);
  min-height: calc(100vh - 56px);
}

.page-title {
  font-family: var(--font-serif);
  font-size: 40px;
  font-weight: 700;
  color: var(--color-text);
  margin: var(--space-8) 0 var(--space-2);
  letter-spacing: 0.04em;
}

.subtitle {
  color: var(--color-text-2);
  margin-bottom: var(--space-12);
  font-size: var(--text-body);
  letter-spacing: 0.02em;
}

/* 轮播 */
.carousel {
  position: relative;
  width: 100%;
  height: 300px;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: var(--space-8);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.slide {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--color-primary) 0%, #0d9488 100%);
  background-size: cover;
  background-position: center;
}
.slide-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(7, 89, 85, 0.7) 0%, transparent 60%);
}
.slide-text {
  position: absolute;
  bottom: 28px;
  left: 28px;
  right: 28px;
  text-align: left;
  color: #fff;
  z-index: 2;
}
.slide-text h2 {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 600;
}
.slide-text p {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}
.dots {
  position: absolute;
  bottom: 14px;
  right: 18px;
  display: flex;
  gap: 6px;
  z-index: 3;
}
.dots button {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, transform 0.15s;
}
.dots button.active {
  background: #fff;
  transform: scale(1.2);
}

/* 公告 */
.announcement {
  background: var(--color-primary-soft);
  border-left: 4px solid var(--color-primary);
  padding: 12px 18px;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-6);
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
}
.ann-icon {
  font-size: 18px;
  flex-shrink: 0;
}
.ann-text {
  font-size: var(--text-caption);
  color: var(--color-text-2);
  line-height: 1.6;
}
.ann-text strong {
  color: var(--color-primary);
}

/* 功能模块卡片 */
.modules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
  text-align: left;
}
.module-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  position: relative;
  background: var(--color-surface);
}
.module-card:not(.disabled):hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--color-primary);
}
.module-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--color-bg);
}
.module-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
.module-title {
  font-size: var(--text-title);
  font-weight: 600;
  margin-bottom: var(--space-1);
}
.module-desc {
  font-size: var(--text-caption);
  color: var(--color-text-2);
  line-height: 1.5;
}
.module-arrow {
  position: absolute;
  right: var(--space-6);
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--color-text-3);
  transition: transform 0.2s, color 0.2s;
}
.module-card:not(.disabled):hover .module-arrow {
  transform: translateY(-50%) translateX(3px);
  color: var(--color-primary);
}
.module-badge {
  position: absolute;
  right: var(--space-6);
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-bg);
  color: var(--color-text-3);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 100px;
  border: 1px solid var(--color-border);
}

@media (max-width: 640px) {
  .home { padding: var(--space-6) var(--space-4); }
  .page-title { font-size: 32px; }
  .subtitle { margin-bottom: var(--space-8); }
  .carousel { height: 220px; }
  .slide-text h2 { font-size: 20px; }
}
</style>
