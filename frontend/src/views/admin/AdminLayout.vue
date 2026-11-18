<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute, RouterView } from 'vue-router';
import { logout, getCachedUser } from '../../api/auth';

const router = useRouter();
const route = useRoute();
const user = computed(() => getCachedUser());

const menuItems = [
  { path: '/admin', name: 'admin-dashboard', label: '控制台' },
  { path: '/admin/data-board', name: 'admin-data-board', label: '数据看板' },
  { path: '/admin/logs', name: 'admin-logs', label: '日志中心' },
  { path: '/admin/content', name: 'admin-content', label: '内容管理' },
  { path: '/admin/products', name: 'admin-products', label: '商品管理' },
  { path: '/admin/users', name: 'admin-users', label: '用户管理' }
];

function handleLogout() {
  logout();
  router.replace('/login');
}

function goBack() {
  router.push('/profile');
}
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo">管理后台</span>
      </div>
      <nav class="menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
          :class="{ active: route.path === item.path || (item.path !== '/admin' && route.path.startsWith(item.path)) }"
        >
          <span class="label">{{ item.label }}</span>
        </router-link>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <span class="current">{{ route.meta.title || '' }}</span>
        <div class="user-area">
          <span>{{ user?.username }}（{{ user?.role }}）</span>
          <button class="ghost-btn" @click="goBack">返回我的</button>
          <button class="danger-btn" @click="handleLogout">退出登录</button>
        </div>
      </header>
      <div class="content-area">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: #F7F6F2;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #303A35;
}
.sidebar {
  width: 220px;
  background: #FFFFFF;
  border-right: 1px solid #E8E8E2;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid #E8E8E2;
}
.sidebar-header .logo {
  font-size: 15px;
  font-weight: 600;
  color: #303A35;
  letter-spacing: 0.03em;
}
.menu { padding: 8px 0; flex: 1; }
.menu-item {
  display: block;
  margin: 2px 10px;
  padding: 9px 14px;
  color: #7B827D;
  text-decoration: none;
  font-size: 14px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.menu-item:hover { background: #F1F2EE; color: #303A35; }
.menu-item.active {
  background: #E9EFEA;
  color: #526F61;
  font-weight: 500;
}
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  height: 60px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8E8E2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
}
.topbar .current { font-size: 16px; font-weight: 600; color: #303A35; }
.user-area {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  color: #7B827D;
}
.user-area button {
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  height: 32px;
}
.user-area .ghost-btn {
  border: 1px solid #E8E8E2;
  background: #FFFFFF;
  color: #526F61;
}
.user-area .ghost-btn:hover { background: #E9EFEA; border-color: #D0D7D1; }
.user-area .danger-btn {
  border: 1px solid #E8E8E2;
  background: #FFFFFF;
  color: #7B827D;
}
.user-area .danger-btn:hover { background: #F1F2EE; color: #C45F55; }
.content-area { flex: 1; padding: 24px; overflow-y: auto; }

@media (max-width: 768px) {
  .admin-layout { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; height: auto; }
  .sidebar-header { border-bottom: none; border-right: 1px solid #E8E8E2; padding: 14px 16px; }
  .menu { display: flex; padding: 0 8px; overflow-x: auto; }
  .menu-item { margin: 0 4px; white-space: nowrap; }
  .menu-item.active { border-radius: 6px; }
}
</style>
