/**
 * @file 前端路由配置
 * @author 第八组
 * @date 2026-11-03
 * @description admin 独立布局（AdminLayout.vue），嵌套子路由；
 *              全局守卫：未登录跳 /login，非 admin 跳 /，role 跳不同首页
 */

import { createRouter, createWebHistory } from 'vue-router';
import { getCachedToken, getCachedUser } from '../api/auth';

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/qa',
    name: 'qa-panel',
    component: () => import('../views/QaPanel.vue'),
    meta: { title: '智能问答' }
  },
  {
    path: '/interaction',
    name: 'interaction',
    component: () => import('../views/InteractionView.vue'),
    meta: { title: '语音交互' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: '数据大屏' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/Profile.vue'),
    meta: { requiresAuth: true, title: '个人中心' }
  },
  // ---------- Admin 后台（独立布局）----------
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('../views/admin/AdminDashboard.vue'),
        meta: { title: '控制台' }
      },
      {
        path: 'content',
        name: 'admin-content',
        component: () => import('../views/admin/ContentAdmin.vue'),
        meta: { title: '内容管理' }
      },
      {
        path: 'products',
        name: 'admin-products',
        component: () => import('../views/admin/ProductAdmin.vue'),
        meta: { title: '商品管理' }
      },
      {
        path: 'kb',
        name: 'admin-kb',
        component: () => import('../views/admin/KnowledgeBaseAdmin.vue'),
        meta: { title: '知识库管理' }
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../views/admin/UserAdmin.vue'),
        meta: { title: '用户管理' }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

/** 全局守卫：未登录跳 /login，非 admin 访问管理端跳 /，admin 访问 / 跳 /admin */
router.beforeEach((to, _from, next) => {
  const token = getCachedToken();
  const user = getCachedUser();

  // 公开页面
  if (to.meta.public) {
    if (token && to.name === 'login') {
      // 已登录再去 /login：admin 去 /admin，普通用户去 /
      next(user?.role === 'admin' ? '/admin' : '/');
      return;
    }
    next();
    return;
  }

  // 需登录但没 token
  if (to.meta.requiresAuth && !token) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  // 需 admin 但用户不是 admin
  if (to.meta.requiresAdmin && user?.role !== 'admin') {
    next('/');
    return;
  }

  // admin 误访问用户端首页 /qa/interaction/dashboard：保持可访问（兼容）
  // 用户误访问 /admin 被上面 requiresAdmin 拦截到 /

  next();
});

export default router;
