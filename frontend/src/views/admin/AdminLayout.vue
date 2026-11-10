<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute, RouterView } from 'vue-router';
import { logout, getCachedUser } from '../../api/auth';

const router = useRouter();
const route = useRoute();
const user = computed(() => getCachedUser());

const menuItems = [
  { path: '/admin', name: 'admin-dashboard', label: '控制台', icon: '🏠' },
  { path: '/admin/content', name: 'admin-content', label: '内容管理', icon: '📝' },
  { path: '/admin/products', name: 'admin-products', label: '商品管理', icon: '🛍️' },
  { path: '/admin/users', name: 'admin-users', label: '用户管理', icon: '👥' }
];

function handleLogout() {
  logout();
  router.replace('/login');
}
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo">西湖</span>
        <span class="app-name">西湖文化 AI 导览</span>
      </div>
      <nav class="menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
          :class="{ active: route.path === item.path || (item.path !== '/admin' && route.path.startsWith(item.path)) }"
        >
          <span class="icon">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
        </router-link>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <span class="current">{{ route.meta.title || '' }}</span>
        <div class="user-area">
          <span>{{ user?.username }}（{{ user?.role }}）</span>
          <button class="btn btn-secondary logout-btn" @click="handleLogout">退出登录</button>
        </div>
      </header>
      <div class="content-area">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 外壳：浅色青绿主题，颜色全部取自 tokens.css */
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg);
  font-family: var(--font-sans);
  color: var(--color-text);
}
.sidebar {
  width: 220px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.sidebar-header .logo {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.05em;
  line-height: 1;
}
.sidebar-header .app-name {
  font-family: var(--font-serif);
  font-weight: 600;
  color: var(--color-text);
  font-size: var(--text-body);
  letter-spacing: 0.02em;
}
.menu { padding: var(--space-2) 0; flex: 1; }
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-1) var(--space-2);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-2);
  text-decoration: none;
  font-size: var(--text-body);
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}
.menu-item:hover { background: var(--color-bg); color: var(--color-text); }
.menu-item.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 500;
}
.menu-item .icon { font-size: 16px; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  height: 52px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-6);
}
.topbar .current { font-size: var(--text-body); font-weight: 600; color: var(--color-text); }
.user-area {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  font-size: var(--text-caption);
  color: var(--color-text-2);
}
.user-area button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-caption);
  color: var(--color-text);
  transition: background 0.15s;
}
.user-area button:hover { background: var(--color-bg); }
.content-area { flex: 1; padding: var(--space-6); overflow-y: auto; }

/* 移动端：侧边栏收起为顶部横条 */
@media (max-width: 768px) {
  .admin-layout { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; }
  .sidebar-header { border-bottom: none; border-right: 1px solid var(--color-border); }
  .menu { display: flex; padding: 0 var(--space-2); }
  .menu-item { margin: 0; }
  .menu-item.active { border-radius: 0; border-bottom: 2px solid var(--color-primary); }
}
</style>
