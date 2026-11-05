<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { loginApi, registerApi } from '../api/auth';

const router = useRouter();
const route = useRoute();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const nickname = ref('');
const loading = ref(false);
const errorMsg = ref('');

async function handleSubmit() {
  errorMsg.value = '';
  if (!username.value.trim() || !password.value.trim()) {
    errorMsg.value = '请填写用户名和密码';
    return;
  }
  if (password.value.length < 6) {
    errorMsg.value = '密码至少 6 位';
    return;
  }
  loading.value = true;
  try {
    const loginResult = mode.value === 'login'
      ? await loginApi(username.value.trim(), password.value)
      : (await registerApi(username.value.trim(), password.value, nickname.value.trim() || undefined),
         await loginApi(username.value.trim(), password.value));
    // 按 role 跳转：admin 进后台，user 进用户端
    const userRole = loginResult.user.role;
    const redirect = route.query.redirect as string | undefined;
    if (redirect) {
      router.replace(redirect);
    } else if (userRole === 'admin') {
      router.replace('/admin');
    } else {
      router.replace('/');
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '操作失败';
  } finally {
    loading.value = false;
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  errorMsg.value = '';
}
</script>

<template>
  <div class="login-page">
    <div class="login-wrap">
      <div class="brand">
        <div class="brand-name">西湖文化 AI 导览</div>
        <div class="brand-sub">LLM + RAG · 智能导览系统</div>
      </div>

      <div class="login-card">
        <h2 class="login-title">{{ mode === 'login' ? '登录' : '注册' }}</h2>

        <form @submit.prevent="handleSubmit" class="login-form">
          <div class="form-row">
            <label class="label" for="login-username">用户名</label>
            <input id="login-username" v-model="username" class="input" type="text" placeholder="admin" autocomplete="username" />
          </div>

          <div class="form-row">
            <label class="label" for="login-password">密码</label>
            <input id="login-password" v-model="password" class="input" type="password" placeholder="至少 6 位" autocomplete="current-password" />
          </div>

          <div class="form-row" v-if="mode === 'register'">
            <label class="label" for="login-nickname">昵称（可选）</label>
            <input id="login-nickname" v-model="nickname" class="input" type="text" placeholder="给自己起个昵称" />
          </div>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>

          <button type="submit" :disabled="loading" class="btn btn-primary submit-btn">
            {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册并登录') }}
          </button>
        </form>

        <button type="button" class="switch-btn" @click="switchMode">
          {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
        </button>

        <p v-if="mode === 'login'" class="hint">默认管理员：<code>admin / admin123</code></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 页面根节点自行覆盖脚手架深色底，不动全局 style.css */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background:
    radial-gradient(600px 320px at 50% -10%, var(--color-primary-soft), transparent 70%),
    var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}

.login-wrap {
  width: min(400px, 100%);
}

/* 品牌区：宋体标题，青绿记忆点 */
.brand {
  text-align: center;
  margin-bottom: var(--space-6);
}
.brand-name {
  font-family: var(--font-serif);
  font-size: var(--text-display);
  font-weight: 600;
  color: var(--color-primary);
  letter-spacing: 0.05em;
}
.brand-sub {
  margin-top: var(--space-1);
  font-size: var(--text-meta);
  color: var(--color-text-2);
}

/* 登录卡片：浮层面板，允许 shadow-lg */
.login-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-8);
}

.login-title {
  margin: 0 0 var(--space-6);
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
  color: var(--color-text);
}

.login-form .form-row {
  margin-bottom: var(--space-4);
}

.form-error {
  margin: 0 0 var(--space-4);
}

.submit-btn {
  width: 100%;
  height: 40px;
  font-size: var(--text-body);
}

.switch-btn {
  display: block;
  width: 100%;
  margin-top: var(--space-4);
  background: none;
  border: none;
  font-size: var(--text-caption);
  color: var(--color-primary);
  cursor: pointer;
  font-family: var(--font-sans);
}
.switch-btn:hover {
  text-decoration: underline;
}

.hint {
  text-align: center;
  font-size: var(--text-meta);
  color: var(--color-text-2);
  margin: var(--space-4) 0 0;
}
.hint code {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 1px var(--space-2);
  border-radius: var(--space-1);
}

@media (max-width: 640px) {
  .login-card {
    padding: var(--space-6);
  }
}
</style>
