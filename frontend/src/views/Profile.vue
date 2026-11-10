<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  getMeApi,
  updateMeApi,
  changePasswordApi,
  logout,
  getCachedUser,
  type LoginUser
} from '../api/auth';

const router = useRouter();

const user = ref<LoginUser | null>(null);
const loading = ref(true);
const errorMsg = ref('');
const successMsg = ref('');

// ---------- 个人信息编辑 ----------
const editMode = ref(false);
const nicknameDraft = ref('');

function startEdit() {
  nicknameDraft.value = user.value?.nickname ?? '';
  errorMsg.value = '';
  successMsg.value = '';
  editMode.value = true;
}

function cancelEdit() {
  editMode.value = false;
  nicknameDraft.value = '';
}

async function handleSaveProfile() {
  errorMsg.value = '';
  successMsg.value = '';
  const trimmed = nicknameDraft.value.trim();
  if (trimmed.length > 32) {
    errorMsg.value = '昵称不能超过 32 个字符';
    return;
  }
  try {
    const updated = await updateMeApi(trimmed);
    user.value = updated;
    editMode.value = false;
    successMsg.value = '个人信息已更新';
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '保存失败';
  }
}

// ---------- 修改密码 ----------
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const pwdLoading = ref(false);
const pwdError = ref('');
const pwdSuccess = ref('');

async function handleChangePassword() {
  pwdError.value = '';
  pwdSuccess.value = '';
  if (!oldPassword.value) { pwdError.value = '请输入旧密码'; return; }
  if (!newPassword.value || newPassword.value.length < 6) { pwdError.value = '新密码至少 6 位'; return; }
  if (newPassword.value !== confirmPassword.value) { pwdError.value = '两次输入的新密码不一致'; return; }
  if (newPassword.value === oldPassword.value) { pwdError.value = '新密码不能与旧密码相同'; return; }
  pwdLoading.value = true;
  try {
    await changePasswordApi(oldPassword.value, newPassword.value);
    pwdSuccess.value = '密码修改成功，下次登录请使用新密码';
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err: unknown) {
    pwdError.value = err instanceof Error ? err.message : '密码修改失败';
  } finally {
    pwdLoading.value = false;
  }
}

// ---------- 退出登录 ----------
function handleLogout() {
  logout();
  router.replace('/login');
}

// ---------- 头像首字 ----------
const avatarInitial = computed(() => {
  const name = user.value?.nickname || user.value?.username || 'U';
  return name.trim().charAt(0).toUpperCase();
});

onMounted(async () => {
  loading.value = true;
  try {
    // 先拿缓存，再强制拉一次最新的
    user.value = getCachedUser();
    const fresh = await getMeApi();
    user.value = fresh;
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '加载用户信息失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="profile-page">
    <div class="profile-wrap">
      <!-- 顶部面包屑 / 返回 -->
      <div class="page-header">
        <button class="back-btn" @click="router.back()">← 返回</button>
        <h1 class="page-title">个人中心</h1>
      </div>

      <!-- 个人信息卡 -->
      <section class="card hero-card">
        <div class="avatar" :class="user?.role === 'admin' ? 'admin' : ''">{{ avatarInitial }}</div>
        <div class="info">
          <div class="name-row">
            <span class="name">{{ user?.nickname || user?.username || '用户' }}</span>
            <span class="role-badge">{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
          </div>
          <div class="meta">
            <span>账号：<code>{{ user?.username }}</code></span>
            <span>用户 ID：<code class="nums">#{{ user?.id }}</code></span>
          </div>
        </div>
        <button class="btn btn-secondary logout-btn" @click="handleLogout">退出登录</button>
      </section>

      <!-- 昵称编辑 -->
      <section class="card">
        <h2 class="card-title">基本信息</h2>
        <div v-if="loading" class="empty-state">加载中...</div>
        <template v-else-if="user">
          <div v-if="!editMode" class="info-display">
            <div class="info-row">
              <span class="info-label">昵称</span>
              <span class="info-value">{{ user.nickname || '（未设置）' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">账号</span>
              <span class="info-value">{{ user.username }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">角色</span>
              <span class="info-value">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">状态</span>
              <span class="info-value">{{ user.status === 'active' ? '正常' : '已禁用' }}</span>
            </div>
            <button class="btn btn-secondary" @click="startEdit">修改昵称</button>
          </div>

          <form v-else class="edit-form" @submit.prevent="handleSaveProfile">
            <label class="label" for="nickname-input">新昵称</label>
            <input
              id="nickname-input"
              v-model="nicknameDraft"
              class="input"
              type="text"
              maxlength="32"
              placeholder="不超过 32 个字符"
            />
            <p v-if="errorMsg" class="error-bar">{{ errorMsg }}</p>
            <p v-if="successMsg" class="success-bar">{{ successMsg }}</p>
            <div class="edit-actions">
              <button type="button" class="btn btn-secondary" @click="cancelEdit">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </template>
      </section>

      <!-- 修改密码 -->
      <section class="card">
        <h2 class="card-title">修改密码</h2>
        <form class="edit-form" @submit.prevent="handleChangePassword">
          <div class="form-row">
            <label class="label" for="old-pwd">当前密码</label>
            <input id="old-pwd" v-model="oldPassword" class="input" type="password" autocomplete="current-password" placeholder="请输入当前密码" />
          </div>
          <div class="form-row">
            <label class="label" for="new-pwd">新密码</label>
            <input id="new-pwd" v-model="newPassword" class="input" type="password" autocomplete="new-password" placeholder="至少 6 位" />
          </div>
          <div class="form-row">
            <label class="label" for="confirm-pwd">确认新密码</label>
            <input id="confirm-pwd" v-model="confirmPassword" class="input" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
          </div>

          <p v-if="pwdError" class="error-bar">{{ pwdError }}</p>
          <p v-if="pwdSuccess" class="success-bar">{{ pwdSuccess }}</p>

          <button type="submit" class="btn btn-primary" :disabled="pwdLoading">
            {{ pwdLoading ? '修改中...' : '确认修改密码' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--color-bg);
  padding: var(--space-10) var(--space-6);
  font-family: var(--font-sans);
  color: var(--color-text);
}

.profile-wrap {
  max-width: 640px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.back-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: var(--text-body);
  font-family: var(--font-sans);
  padding: 0;
}
.back-btn:hover { text-decoration: underline; }

.page-title {
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
  margin: 0;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  margin-bottom: var(--space-5);
  box-shadow: var(--shadow-sm);
}

.card-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 var(--space-4);
  color: var(--color-text);
}

/* ---------- Hero 卡 ---------- */
.hero-card {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface) 100%);
}
.avatar {
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.04em;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.25);
}
.avatar.admin {
  background: linear-gradient(135deg, var(--color-primary) 0%, #0d9488 100%);
}
.info {
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.name {
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
  color: var(--color-text);
}
.role-badge {
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 100px;
  font-weight: 500;
}
.meta {
  display: flex;
  gap: var(--space-4);
  font-size: var(--text-caption);
  color: var(--color-text-2);
}
.meta code {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: var(--text-meta);
}

.logout-btn {
  flex: 0 0 auto;
  height: 36px;
}

/* ---------- 信息展示 ---------- */
.info-display {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.info-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border);
}
.info-row:last-of-type { border-bottom: none; }
.info-label {
  flex: 0 0 80px;
  color: var(--color-text-2);
  font-size: var(--text-body);
}
.info-value {
  flex: 1;
  color: var(--color-text);
  font-size: var(--text-body);
}

.empty-state {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-3);
}

/* ---------- 编辑表单 ---------- */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.label {
  font-size: var(--text-caption);
  font-weight: 500;
  color: var(--color-text-2);
}
.input {
  height: 40px;
}
.edit-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
}
.success-bar {
  color: var(--color-primary);
  margin: 0;
}

@media (max-width: 640px) {
  .profile-page { padding: var(--space-6) var(--space-4); }
  .hero-card {
    flex-direction: column;
    text-align: center;
    gap: var(--space-3);
  }
  .meta { justify-content: center; }
  .logout-btn { width: 100%; }
  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
