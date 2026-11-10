<!--
  @file 登录 / 注册页
  @author 第八组（成员C）
  @date 2026-11-03
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { loginApi, registerApi } from '../api/auth';

const router = useRouter();
const route = useRoute();

const isRegister = ref(false);
const form = ref({
  username: '',
  password: '',
  nickname: '',
  role: 'user' as 'admin' | 'user'
});
const loading = ref(false);
const errorMsg = ref('');

async function handleSubmit() {
  errorMsg.value = '';
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请填写用户名和密码';
    return;
  }
  loading.value = true;
  try {
    const result = isRegister.value
      ? await registerApi({ ...form.value })
      : await loginApi(form.value.username, form.value.password);

    // 保存 token + 用户信息到 localStorage
    localStorage.setItem('auth_token', result.token);
    localStorage.setItem('auth_user', JSON.stringify(result.user));

    // 跳转到 redirect 地址或首页
    const redirect = (route.query.redirect as string) ?? '/';
    router.replace(redirect);
  } catch (err) {
    errorMsg.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function toggleMode() {
  isRegister.value = !isRegister.value;
  errorMsg.value = '';
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h2>{{ isRegister ? '注册新账户' : '后台登录' }}</h2>

      <form @submit.prevent="handleSubmit" class="login-form">
        <label>
          用户名
          <input v-model="form.username" type="text" placeholder="3-32 字符" maxlength="32" />
        </label>

        <label>
          密码
          <input v-model="form.password" type="password" placeholder="至少 6 位" />
        </label>

        <label v-if="isRegister">
          昵称（可选）
          <input v-model="form.nickname" type="text" placeholder="显示名称" />
        </label>

        <label v-if="isRegister" class="role-select">
          角色
          <select v-model="form.role">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>

        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

        <button type="submit" :disabled="loading">
          {{ loading ? '处理中...' : (isRegister ? '注册' : '登录') }}
        </button>
      </form>

      <p class="toggle-link" @click="toggleMode">
        {{ isRegister ? '已有账户？去登录' : '没有账户？去注册' }}
      </p>

      <div class="default-hint" v-if="!isRegister">
        默认管理员：<code>admin / admin123</code>
      </div>
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
}

.login-card {
  background: #fff;
  padding: 40px 36px;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 360px;
}

.login-card h2 {
  margin: 0 0 24px;
  text-align: center;
  color: #333;
}

.login-form label {
  display: block;
  margin-bottom: 14px;
  font-size: 13px;
  color: #555;
}

.login-form input,
.login-form select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.login-form input:focus,
.login-form select:focus {
  border-color: #667eea;
}

.role-select select {
  background: #fff;
}

.error {
  color: #e74c3c;
  font-size: 13px;
  margin: 10px 0;
}

.login-form button {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.2s;
  margin-top: 8px;
}

.login-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-link {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #667eea;
  cursor: pointer;
}

.toggle-link:hover {
  text-decoration: underline;
}

.default-hint {
  margin-top: 18px;
  padding: 10px;
  background: #f0f4ff;
  border-radius: 6px;
  font-size: 12px;
  color: #555;
  text-align: center;
}

.default-hint code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
