<script setup lang="ts">
/**
 * @file 移动端布局容器（成员D · 全组前端地基）
 * @description 提供底部 TabBar + 子路由出口，所有 C 端页面用嵌套路由挂在此之下
 *              TabBar 固定 4 个：首页 / AI导览 / 失物招领 / 我的
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const active = computed(() => route.path);

interface TabItem {
  label: string;
  to: string;
  icon: string; // Vant built-in icon name
}

const tabs: TabItem[] = [
  { label: '首页', to: '/home', icon: 'home-o' },
  { label: 'AI导览', to: '/interaction', icon: 'chat-o' },
  { label: '失物招领', to: '/lost-found', icon: 'goods-o' },
  { label: '我的', to: '/profile', icon: 'user-o' },
];

function onSwitch(path: string) {
  if (path !== route.path) {
    router.push(path);
  }
}
</script>

<template>
  <div class="mobile-layout">
    <!-- 内容区域 -->
    <main class="mobile-layout__content">
      <router-view />
    </main>

    <!-- 底部 TabBar -->
    <van-tabbar :model="active" route inactive-color="#969799" active-color="#1989fa" safe-area-inset-bottom>
      <van-tabbar-item
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :icon="tab.icon"
      >
        {{ tab.label }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.mobile-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f7f8fa;
}

.mobile-layout__content {
  flex: 1;
  padding-bottom: 50px; /* 给 tabbar 留空间 */
  overflow-y: auto;
}
</style>
