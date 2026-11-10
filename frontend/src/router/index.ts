/**
 * @file 前端路由配置
 * @author 第八组（成员D · 全组前端地基 + 成员C AdminLayout 重构 + 成员B POI/导航路由）
 * @date 2026-11-10（合并 D analytics + C rbac + B stash 后的统一版本）
 * @description
 *   - TabBar 内页面：/home /interaction /lost-found /profile 挂在 MobileLayout 下
 *   - 独立移动端页面：/lost-found/publish /routes /routes/:id
 *   - PC 端独立页面：/qa /dashboard
 *   - AdminLayout 嵌套：/admin → dashboard / content / products / kb / users
 *   - 导航相关（成员B）：等 stash pop 时加 /pois /navigate
 *   - 路由守卫：统一用 userStore（成员D），逻辑来自成员C（真跳 login 不是 console.warn）
 */
import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes = [
  // ============ 移动端 TabBar 嵌套路由（成员D） ============
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
      // AI 导览 Tab → 复用成员A 已有的语音交互页
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

  // ============ 失物招领发布页（成员D，非 Tab 页面） ============
  {
    path: '/lost-found/publish',
    name: 'lost-found-publish',
    component: () => import('../views/mobile/LostFoundPublish.vue'),
    meta: { title: '发布失物招领' },
  },

  // ============ 游玩攻略（成员D，独立移动端页面） ============
  {
    path: '/routes',
    name: 'guide-list',
    component: () => import('../views/mobile/GuideList.vue'),
    meta: { title: '游玩攻略' },
  },
  {
    path: '/routes/:id',
    name: 'guide-detail',
    component: () => import('../views/mobile/GuideDetail.vue'),
    meta: { title: '路线详情' },
  },

  // ============ 导航相关（成员B，等 stash pop 时补完组件再加） ============
  // {
  //   path: '/pois',
  //   name: 'poi-list',
  //   component: () => import('../views/PoiList.vue'),
  //   meta: { title: '景点列表' },
  // },
  // {
  //   path: '/navigate',
  //   name: 'navigate',
  //   component: () => import('../views/Navigate.vue'),
  //   meta: { title: '导航前往' },
  // },

  // ============ PC 端独立页面 ============
  {
    path: '/qa',
    name: 'qa-panel',
    component: () => import('../views/QaPanel.vue'),
    meta: { title: '智能问答' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { title: '运营大屏', requiresAuth: true },
  },

  // ============ 登录页（成员C） ============
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '登录' },
  },

  // ============ Admin 后台（成员C，完整嵌套 + 多了 products/users） ============
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('../views/admin/AdminDashboard.vue'),
        meta: { title: '控制台' },
      },
      {
        path: 'content',
        name: 'admin-content',
        component: () => import('../views/admin/ContentAdmin.vue'),
        meta: { title: '内容管理' },
      },
      {
        path: 'products',
        name: 'admin-products',
        component: () => import('../views/admin/ProductAdmin.vue'),
        meta: { title: '商品管理' },
      },
      {
        path: 'kb',
        name: 'admin-kb',
        component: () => import('../views/admin/KnowledgeBaseAdmin.vue'),
        meta: { title: '知识库管理' },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../views/admin/UserAdmin.vue'),
        meta: { title: '用户管理' },
      },
    ],
  },

  // ============ 根路径兜底 ============
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
 * - 统一用 D 的 userStore 读取登录态/角色
 * - 跳转逻辑来自 C 的登录体系：未登录真跳 /login，非 admin 真跳 /
 * - 已登录再去 /login：admin 去 /admin，其他去 /
 */
router.beforeEach((to, _from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} · 景区导览 AI`;
  }

  const userStore = useUserStore();

  // 公开页面（如 /login）
  if (to.meta?.public) {
    if (userStore.isLoggedIn && to.name === 'login') {
      next(userStore.userInfo?.role === 'admin' ? '/admin' : '/');
      return;
    }
    next();
    return;
  }

  // 需要登录但没 token → 跳 /login 并记住 redirect
  if (to.meta?.requiresAuth && !userStore.isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  // 需要 admin 但当前用户不是 admin（operator 也放行，D 定义的 isAdmin 已包含）
  if (to.meta?.requiresAdmin && !userStore.isAdmin) {
    next('/');
    return;
  }

  next();
});

export default router;
