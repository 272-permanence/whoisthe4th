/**
 * @file 前端路由配置（成员D · 全组前端地基）
 * @author 第八组
 * @date 2026-10-27（重构：加入 MobileLayout 嵌套路由 + 权限守卫骨架）
 * @description
 *   - TabBar 内页面：/home /interaction /lost-found /profile 挂在 MobileLayout 下
 *   - 独立页面：/dashboard（数据大屏）、/qa（问答面板）、/admin/*（管理后台）
 *   - 路由守卫：requiresAuth → 检查 token；requiresAdmin → 检查角色
 *     TODO: 等成员C的登录接口出来后，401 跳转登录页（先用 mock 占位）
 */

import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes = [
  // ============ 移动端 TabBar 嵌套路由 ============
  {
    path: '/',
    component: () => import('../layouts/MobileLayout.vue'),
    redirect: '/home',
    children: [
      {
        path: 'home',
        name: 'mobile-home',
        component: () => import('../views/mobile/HomePage.vue'),
        meta: { title: '首页' },
      },
      // AI 导览 Tab → 复用成员 A 已有的交互页
      {
        path: 'interaction',
        name: 'mobile-interaction',
        component: () => import('../views/InteractionView.vue'),
        meta: { title: 'AI 导览' },
      },
      {
        path: 'lost-found',
        name: 'mobile-lost-found',
        component: () => import('../views/mobile/LostFoundList.vue'),
        meta: { title: '失物招领' },
      },
      {
        path: 'profile',
        name: 'mobile-profile',
        component: () => import('../views/mobile/ProfilePage.vue'),
        meta: { title: '我的', requiresAuth: true },
      },
    ],
  },

  // ============ 失物招领发布页（非 Tab 页面，从列表页跳转） ============
  {
    path: '/lost-found/publish',
    name: 'lost-found-publish',
    component: () => import('../views/mobile/LostFoundPublish.vue'),
    meta: { title: '发布失物招领' },
  },

  // ============ 独立页面（非 TabBar 内） ============
  {
    path: '/qa',
    name: 'qa-panel',
    component: () => import('../views/QaPanel.vue'),
    meta: { title: '问答面板' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: '运营大屏', requiresAuth: true },
  },
  {
    path: '/admin/kb',
    name: 'admin-kb',
    component: () => import('../views/admin/KnowledgeBaseAdmin.vue'),
    meta: { title: '知识库管理', requiresAuth: true, requiresAdmin: true },
  },

  // 根路径兜底
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 全局路由守卫
 * TODO: 等成员C的 /auth/login 接口出来后：
 *   1) 未登录访问 requiresAuth → 跳转 /login
 *   2) 401 响应时跳 /login（当前拦截器已清 token，但未跳转）
 * 当前先用 console.warn 占位，等登录页落地后补全
 */
router.beforeEach((to, _from, next) => {
  // 动态设置页面标题
  if (to.meta?.title) {
    document.title = `${to.meta.title} · 景区导览 AI`;
  }

  // pinia 在 main.ts 中先于 router 安装，守卫内可直接使用 store
  const userStore = useUserStore();

  // 需要登录但未登录 → 占位处理
  if (to.meta?.requiresAuth && !userStore.isLoggedIn) {
    console.warn(`[router] ${to.path} 需要登录，但当前未登录。等成员C登录页落地后跳转。`);
    // 临时放行让页面能展示骨架，后续补全跳转
  }

  // 需要管理员权限
  if (to.meta?.requiresAdmin && !userStore.isAdmin) {
    console.warn(`[router] ${to.path} 需要管理员权限。`);
    // 临时放行，后续补全跳转
  }

  next();
});

export default router;
