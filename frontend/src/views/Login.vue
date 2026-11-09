<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { loginApi, registerApi, getCaptchaApi } from '../api/auth';

const router = useRouter();
const route = useRoute();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const nickname = ref('');
const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

// 图形验证码
const captchaId = ref('');
const captchaCode = ref('');
const captchaSvg = ref('');
const captchaLoading = ref(false);

/** SVG 转 data URL 供 <img> 渲染 */
const captchaSrc = computed(() =>
  captchaSvg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaSvg.value)}` : ''
);

/** 拉取/刷新验证码 */
async function loadCaptcha() {
  captchaLoading.value = true;
  try {
    const data = await getCaptchaApi();
    captchaId.value = data.captchaId;
    captchaSvg.value = data.svg;
    captchaCode.value = '';
  } catch {
    captchaSvg.value = '';
    errorMsg.value = '验证码加载失败，请点击重试';
  } finally {
    captchaLoading.value = false;
  }
}

async function handleSubmit() {
  errorMsg.value = '';
  successMsg.value = '';
  if (!username.value.trim() || !password.value.trim()) {
    errorMsg.value = '请填写用户名和密码';
    return;
  }
  if (password.value.length < 6) {
    errorMsg.value = '密码至少 6 位';
    return;
  }
  if (!captchaId.value || !captchaCode.value.trim()) {
    errorMsg.value = '请填写验证码';
    return;
  }
  loading.value = true;
  try {
    if (mode.value === 'register') {
      await registerApi(
        username.value.trim(),
        password.value,
        nickname.value.trim() || undefined,
        captchaId.value,
        captchaCode.value.trim()
      );
      // 验证码已消费，注册成功后回到登录态（不再自动登录）
      mode.value = 'login';
      password.value = '';
      successMsg.value = '注册成功，请使用新账号登录';
      await loadCaptcha();
      return;
    }

    const loginResult = await loginApi(
      username.value.trim(),
      password.value,
      captchaId.value,
      captchaCode.value.trim()
    );
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
    // 验证码一次性使用，失败后必须刷新
    await loadCaptcha();
  } finally {
    loading.value = false;
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  errorMsg.value = '';
  successMsg.value = '';
  loadCaptcha();
}

onMounted(loadCaptcha);
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

          <div class="form-row">
            <label class="label" for="login-captcha">验证码</label>
            <div class="captcha-row">
              <input
                id="login-captcha"
                v-model="captchaCode"
                class="input"
                type="text"
                maxlength="4"
                placeholder="4 位验证码"
                autocomplete="off"
              />
              <img
                v-if="captchaSrc"
                class="captcha-img"
                :src="captchaSrc"
                alt="验证码"
                title="点击刷新"
                @click="loadCaptcha"
              />
              <div v-else class="captcha-img captcha-placeholder" @click="loadCaptcha">
                {{ captchaLoading ? '加载中' : '点击获取' }}
              </div>
            </div>
          </div>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>
          <p v-if="successMsg" class="success-bar form-error">{{ successMsg }}</p>

          <button type="submit" :disabled="loading" class="btn btn-primary submit-btn">
            {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册') }}
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

/* 验证码 */
.captcha-row {
  display: flex;
  gap: var(--space-3);
  align-items: stretch;
}
.captcha-row .input {
  flex: 1;
  min-width: 0;
}
.captcha-img {
  flex: 0 0 auto;
  width: 120px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  cursor: pointer;
  object-fit: cover;
}
.captcha-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-meta);
  color: var(--color-text-2);
}

.success-bar {
  color: var(--color-primary);
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
