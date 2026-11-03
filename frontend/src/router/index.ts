/**
 * @file 前端路由配置
 * @author 第八组
 * @date 2026-10-15
 */

import { createRouter, createWebHistory } from 'vue-router';
import { getCachedToken, getCachedUser } from '../api/auth';

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
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/admin/kb',
    name: 'admin-kb',
    component: () => import('../views/admin/KnowledgeBaseAdmin.vue'),
    meta: { requiresAuth: true }
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

/** 全局守卫：未登录跳 /login，非 admin 访问受保护页跳 / */
router.beforeEach((to, _from, next) => {
  const token = getCachedToken();
  const user = getCachedUser();

  // 公开页面：已登录用户访问 /login 时跳转首页
  if (to.meta.public) {
    if (token && to.name === 'login') {
      next('/');
      return;
    }
    next();
    return;
  }

  // 需登录但没 token → 去 /login
  if (to.meta.requiresAuth && !token) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  // 需 admin 但用户不是 admin → 去首页
  if (to.meta.requiresAdmin && user?.role !== 'admin') {
    next('/');
    return;
  }

  next();
});

export default router;
