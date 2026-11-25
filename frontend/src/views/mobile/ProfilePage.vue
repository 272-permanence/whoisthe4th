<script setup lang="ts">
/**
 * @file 个人中心页（成员D · 骨架 → 成员C · 真实登录态 + 退出跳登录 + 商品入口）
 * @description 登录态由 Pinia userStore 管理，退出后直接 router.replace('/login')
 * @author 第八组（成员D + 成员C）
 * @date 2026-11-25
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { useUserStore } from '../../stores/user';

const router = useRouter();
const userStore = useUserStore();

const displayName = computed(() => userStore.userInfo?.displayName || userStore.userInfo?.username || '游客');
const username = computed(() => userStore.userInfo?.username || '—');
const userId = computed(() => userStore.userInfo?.id || '—');
const isAdmin = computed(() => userStore.isAdmin);

const roleLabel = computed(() => {
  const r = userStore.userInfo?.role;
  if (r === 'admin') return '管理员';
  if (r === 'operator') return '运营';
  return '普通用户';
});

/** 菜单分组 — 全部走 router.push 跳转 */
const menuGroups = computed(() => [
  {
    title: '我的服务',
    items: [
      { icon: 'shop-o', label: '文创商城', desc: '景区周边好物', onClick: () => router.push('/products') },
      { icon: 'location-o', label: '我的发布', desc: '失物招领 / 寻亲', onClick: () => showToast('功能开发中') },
      { icon: 'orders-o', label: '我的订单', desc: '商品购买记录', onClick: () => showToast('功能开发中') },
    ],
  },
  {
    title: '管理',
    hidden: !isAdmin.value,
    items: [
      { icon: 'apps-o', label: '管理后台', desc: '', onClick: () => router.push('/admin') },
    ],
  },
  {
    title: '帮助与设置',
    items: [
      { icon: 'contact', label: '在线客服', desc: '7×24 小时', onClick: () => router.push('/cs') },
      { icon: 'question-o', label: '关于景区 AI', desc: '', onClick: () => showToast('v1.0 · 第八组课程项目') },
    ],
  },
  {
    title: '账号',
    items: [
      {
        icon: 'replay',
        label: userStore.isLoggedIn ? '退出登录' : '去登录',
        desc: userStore.isLoggedIn ? '清除本地登录态并返回登录页' : '',
        danger: true,
        onClick: () => {
          if (userStore.isLoggedIn) doLogout();
          else router.push('/login');
        },
      },
    ],
  },
]);

async function doLogout() {
  try {
    await showConfirmDialog({
      title: '确认退出',
      message: '退出后需要重新登录才能使用账号功能',
      confirmButtonText: '退出',
      confirmButtonColor: '#ff4d4f',
    });
  } catch {
    return; // 用户点了取消
  }
  userStore.logout();
  showToast({ message: '已退出登录', position: 'top' });
  // 直接跳登录页（带 redirect 让守卫自动处理）
  router.replace({ name: 'login', query: { redirect: '/profile' } });
}
</script>

<template>
  <div class="profile-page">
    <!-- 顶部渐变用户卡片 -->
    <div class="user-card">
      <div class="bg-decor"></div>
      <div class="card-content">
        <div class="avatar">
          <van-icon name="user-o" size="36" />
        </div>
        <div class="user-info">
          <div class="user-name">
            {{ displayName }}
            <van-tag
              v-if="userStore.isLoggedIn"
              :type="isAdmin ? 'primary' : 'default'"
              size="medium"
              round
            >
              {{ roleLabel }}
            </van-tag>
          </div>
          <div class="user-meta">
            <span v-if="userStore.isLoggedIn">ID: {{ userId }}</span>
            <span v-else>未登录</span>
            <span class="dot">·</span>
            <span>@{{ username }}</span>
          </div>
        </div>
        <van-button
          v-if="!userStore.isLoggedIn"
          type="primary"
          size="small"
          round
          @click="router.push('/login')"
        >
          登录
        </van-button>
      </div>
    </div>

    <!-- 菜单分组 -->
    <template v-for="group in menuGroups" :key="group.title">
      <van-cell-group
        inset
        class="menu-group"
        :style="{ display: group.hidden ? 'none' : undefined }"
      >
        <template #title class="menu-title">{{ group.title }}</template>
        <van-cell
          v-for="item in group.items"
          :key="item.label"
          :title="item.label"
          :icon="item.icon"
          :value="item.desc || undefined"
          is-link
          :class="{ 'cell-danger': item.danger }"
          @click="item.onClick"
        />
      </van-cell-group>
    </template>

    <p class="page-footer">景区导览 AI · 第八组 · v1.0</p>
  </div>
</template>

<style scoped>
.profile-page {
  padding-bottom: 60px;
  background: #f5f6f8;
  min-height: 100%;
}

/* ============ 用户卡片 ============ */
.user-card {
  position: relative;
  overflow: hidden;
  padding: 28px 20px 24px;
  background: linear-gradient(135deg, #0d6efd 0%, #667eea 100%);
  color: #fff;
}
.bg-decor {
  position: absolute;
  right: -30px;
  top: -30px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}
.bg-decor::after {
  content: '';
  position: absolute;
  right: 20px;
  bottom: 20px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}
.card-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.4);
}
.user-info {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.user-meta {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.user-meta .dot {
  opacity: 0.6;
}

/* ============ 菜单 ============ */
.menu-group {
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
}
.menu-title {
  font-size: 12px;
  color: #969799;
  font-weight: 500;
}
.cell-danger {
  color: #ff4d4f !important;
}
:deep(.cell-danger .van-cell__title) {
  color: #ff4d4f;
}

.page-footer {
  text-align: center;
  font-size: 11px;
  color: #c8c9cc;
  margin-top: 28px;
}
</style>
