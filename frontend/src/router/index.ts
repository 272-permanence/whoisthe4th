/**
 * @file 前端路由配置
 * @author 第八组
 * @date 2026-10-15
 */

import { createRouter, createWebHistory } from 'vue-router';

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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
