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
    if (mode.value === 'login') {
      await loginApi(username.value.trim(), password.value);
    } else {
      await registerApi(username.value.trim(), password.value, nickname.value.trim() || undefined);
      // 注册成功后直接登录
      await loginApi(username.value.trim(), password.value);
    }
    const redirect = (route.query.redirect as string) || '/';
    router.replace(redirect);
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
    <div class="login-card">
      <h1>景区导览 AI 数字人</h1>
      <h2>{{ mode === 'login' ? '登录' : '注册' }}</h2>

      <form @submit.prevent="handleSubmit" class="login-form">
        <label>
          <span>用户名</span>
          <input v-model="username" type="text" placeholder="admin" autocomplete="username" />
        </label>

        <label>
          <span>密码</span>
          <input v-model="password" type="password" placeholder="至少 6 位" autocomplete="current-password" />
        </label>

        <label v-if="mode === 'register'">
          <span>昵称（可选）</span>
          <input v-model="nickname" type="text" placeholder="给自己起个昵称" />
        </label>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <button type="submit" :disabled="loading" class="submit-btn">
          {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册并登录') }}
        </button>
      </form>

      <button type="button" class="switch-btn" @click="switchMode">
        {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
      </button>

      <p v-if="mode === 'login'" class="hint">默认管理员：admin / admin123</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px 36px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.login-card h1 {
  font-size: 16px;
  color: #888;
  margin: 0 0 4px 0;
  text-align: center;
}
.login-card h2 {
  font-size: 24px;
  margin: 0 0 24px 0;
  text-align: center;
  color: #333;
}
.login-form label {
  display: block;
  margin-bottom: 14px;
}
.login-form span {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 6px;
}
.login-form input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.login-form input:focus {
  outline: none;
  border-color: #667eea;
}
.error {
  color: #d33;
  font-size: 13px;
  margin: 8px 0;
  background: #fff0f0;
  padding: 6px 10px;
  border-radius: 4px;
}
.submit-btn {
  width: 100%;
  padding: 12px;
  background: #667eea;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.2s;
}
.submit-btn:hover:not(:disabled) { background: #5568d3; }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.switch-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  background: none;
  border: none;
  color: #667eea;
  font-size: 13px;
  cursor: pointer;
}
.switch-btn:hover { text-decoration: underline; }
.hint {
  text-align: center;
  font-size: 12px;
  color: #aaa;
  margin-top: 18px;
}
</style>
