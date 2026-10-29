<script setup lang="ts">
/**
 * @file 个人中心页（成员D · 占位骨架）
 * @description 用户信息、我的发布、退出登录、管理者专属入口
 *              TODO: 等成员C的 /auth/login 接口出来后，用真实登录态替换 mockLogin
 *                    等成员C的商品管理后台 + 我的发布接口出来后填全
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { useUserStore } from '../../stores/user';

const router = useRouter();
const userStore = useUserStore();

const displayName = computed(() => userStore.userInfo?.displayName || userStore.userInfo?.username || '未登录');
const isAdmin = computed(() => userStore.isAdmin);
const roleLabel = computed(() => {
  const r = userStore.userInfo?.role;
  if (r === 'admin') return '管理员';
  if (r === 'operator') return '运营';
  return '普通用户';
});

// 快捷菜单
const menuGroups = computed(() => [
  {
    title: '我的',
    items: [
      { icon: 'location-o', label: '我的发布', onClick: () => showToast('待接口：我的失物招领列表') },
    ],
  },
  {
    title: '管理',
    hidden: !isAdmin.value,
    items: [
      { icon: 'bar-chart-o', label: '数据面板', onClick: () => router.push('/dashboard') },
      { icon: 'apps-o', label: '知识库管理', onClick: () => router.push('/admin/kb') },
      { icon: 'shop-o', label: '商品管理', onClick: () => showToast('待成员C的商品管理后台') },
    ],
  },
  {
    title: '账号',
    items: [
      { icon: 'contact', label: '联系我们', onClick: () => showToast('功能待开发') },
    ],
  },
]);

// 登录/切换（占位 mock）
function mockLogin(role: 'admin' | 'operator' | 'visitor') {
  userStore.mockLogin(role);
  showToast(`已切换为${role === 'admin' ? '管理员' : role === 'operator' ? '运营' : '普通用户'}`);
}

async function doLogout() {
  if (!userStore.isLoggedIn) return;
  try {
    await showConfirmDialog({ title: '确认', message: '确定退出登录？' });
    userStore.logout();
    showToast('已退出');
  } catch {
    // 取消
  }
}
</script>

<template>
  <div class="profile-page">
    <!-- 顶部用户信息 -->
    <div class="user-card">
      <div class="avatar">
        <van-icon name="user-o" size="32" />
      </div>
      <div class="user-info">
        <div class="user-name">
          {{ displayName }}
          <van-tag v-if="userStore.isLoggedIn" :type="isAdmin ? 'primary' : 'default'" size="medium">
            {{ roleLabel }}
          </van-tag>
        </div>
        <div class="user-desc" v-if="!userStore.isLoggedIn">未登录（可点击下方按钮切换角色）</div>
      </div>
    </div>

    <!-- 菜单 -->
    <van-cell-group
      v-for="group in menuGroups"
      :key="group.title"
      inset
      class="menu-group"
      :style="{ display: group.hidden ? 'none' : undefined }"
    >
      <template #title>{{ group.title }}</template>
      <van-cell
        v-for="item in group.items"
        :key="item.label"
        :title="item.label"
        :icon="item.icon"
        is-link
        @click="item.onClick"
      />
    </van-cell-group>

    <!-- 开发调试用：角色切换按钮（等 C 登录出来后删掉） -->
    <div v-if="!userStore.isLoggedIn" class="dev-actions">
      <p class="dev-hint">⚠️ 开发占位：点击下面按钮模拟登录不同角色</p>
      <van-button size="small" type="primary" @click="mockLogin('admin')">模拟管理员</van-button>
      <van-button size="small" type="warning" @click="mockLogin('operator')">模拟运营</van-button>
      <van-button size="small" @click="mockLogin('visitor')">模拟普通用户</van-button>
    </div>

    <!-- 退出 -->
    <div v-if="userStore.isLoggedIn" class="logout-wrap">
      <van-button block type="danger" plain @click="doLogout">退出登录</van-button>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  padding-bottom: 40px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 16px;
  background: linear-gradient(135deg, #1989fa, #4db8ff);
  color: #fff;
}
.avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.user-info {
  flex: 1;
}
.user-name {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-desc {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 2px;
}

.menu-group {
  margin-top: 12px;
}

.dev-actions {
  margin-top: 20px;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dev-hint {
  font-size: 12px;
  color: #ff976a;
  margin-bottom: 4px;
}

.logout-wrap {
  margin-top: 24px;
  padding: 0 16px;
}
</style>
