/**
 * @file 前端路由配置（含全局鉴权守卫）
 * @author 第八组
 * @date 2026-11-03
 */

import { createRouter, createWebHistory } from 'vue-router';

/** 路由元信息类型 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 需要登录才能访问 */
    requiresAuth?: boolean;
    /** 需要 admin 角色 */
    requiresAdmin?: boolean;
  }
}

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/qa',
    name: 'qa-panel',
    component: () => import('../views/QaPanel.vue')
  },
  {
    path: '/interaction',
    name: 'interaction',
    component: () => import('../views/InteractionView.vue')
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue')
  },
  {
    path: '/admin/kb',
    name: 'admin-kb',
    component: () => import('../views/admin/KnowledgeBaseAdmin.vue'),
    meta: { requiresAuth: true }
  },

  // ---- 成员C 新增 ----
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/admin/products',
    name: 'admin-products',
    component: () => import('../views/admin/ProductAdmin.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

/** 全局路由守卫：未登录访问受保护页面 → 跳转登录 */
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('auth_token');

  if (to.meta.requiresAuth && !token) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.requiresAdmin) {
    const userStr = localStorage.getItem('auth_user');
    const user = userStr ? (JSON.parse(userStr) as { role: string }) : null;
    if (!user || user.role !== 'admin') {
      next({ name: 'home' });
      return;
    }
  }

  // 已登录用户访问 /login → 回首页
  if (to.name === 'login' && token) {
    next({ name: 'home' });
    return;
  }

  next();
});

export default router;
