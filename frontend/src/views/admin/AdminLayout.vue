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
        <span class="logo">🎫</span>
        <span class="app-name">导览管理后台</span>
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
          <button @click="handleLogout">退出登录</button>
        </div>
      </header>
      <div class="content-area">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-layout { display: flex; min-height: 100vh; background: #f5f6fa; }
.sidebar {
  width: 220px; background: #1e272e; color: #dcdde1;
  display: flex; flex-direction: column; flex-shrink: 0;
}
.sidebar-header {
  padding: 20px 16px; border-bottom: 1px solid #2f3640;
  display: flex; align-items: center; gap: 8px;
}
.sidebar-header .logo { font-size: 22px; }
.sidebar-header .app-name { font-weight: 600; color: #fff; font-size: 14px; }
.menu { padding: 12px 0; flex: 1; }
.menu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; color: #b2bec3; text-decoration: none;
  font-size: 14px; border-left: 3px solid transparent;
  transition: all 0.15s;
}
.menu-item:hover { background: #2f3640; color: #fff; }
.menu-item.active { background: #2f3640; color: #fff; border-left-color: #667eea; }
.menu-item .icon { font-size: 16px; }
.main { flex: 1; display: flex; flex-direction: column; }
.topbar {
  height: 52px; background: #fff; border-bottom: 1px solid #eee;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 24px;
}
.topbar .current { font-size: 16px; font-weight: 600; color: #333; }
.user-area { display: flex; gap: 14px; align-items: center; font-size: 13px; color: #666; }
.user-area button {
  padding: 6px 12px; border: 1px solid #ddd; background: #fff;
  border-radius: 4px; cursor: pointer; font-size: 12px;
}
.user-area button:hover { background: #f5f5f5; }
.content-area { flex: 1; padding: 20px 24px; overflow-y: auto; }
</style>
