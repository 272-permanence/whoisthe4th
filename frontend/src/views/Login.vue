<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  loginApi,
  registerApi,
  getCaptchaApi,
  getProvidersApi,
  sendEmailCodeApi,
  emailLoginApi,
  sendPhoneCodeApi,
  phoneLoginApi,
  createWechatQrApi,
  pollWechatQrApi,
  mockWechatScanApi,
  mockWechatConfirmApi,
  ssoMockLoginApi,
  certLoginApi,
  type LoginResult,
  type ProviderStatus,
  type WechatQrStatus
} from '../api/auth';

const router = useRouter();
const route = useRoute();

/** 登录方式：账号密码 / 邮箱验证码 / 手机号验证码 / 微信扫码 / 统一认证 / 数字证书 */
type LoginMethod = 'password' | 'email' | 'phone' | 'wechat' | 'sso' | 'cert';

const methodTabs: { key: LoginMethod; label: string; icon: string }[] = [
  { key: 'password', label: '账号密码', icon: '🔑' },
  { key: 'email', label: '邮箱验证码', icon: '✉️' },
  { key: 'phone', label: '手机号验证码', icon: '📱' },
  { key: 'wechat', label: '微信扫码', icon: '💬' },
  { key: 'sso', label: '统一认证', icon: '🏛️' },
  { key: 'cert', label: '数字证书', icon: '🔒' }
];

const method = ref<LoginMethod>('password');
const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

/** 各通道模式（用于展示「演示模式」标识） */
const providers = ref<ProviderStatus | null>(null);

/** 是否全部为 mock 演示模式 */
const demoMode = computed(() => {
  const p = providers.value;
  return !!p && p.email.mode === 'mock' && p.phone.mode === 'mock' && p.wechat.mode === 'mock' && p.sso.mode === 'mock' && p.cert.mode === 'mock';
});

const panelTitle = computed(
  () =>
    ({
      password: mode.value === 'login' ? '欢迎回来' : '创建账号',
      email: '邮箱验证码登录',
      phone: '手机号验证码登录',
      wechat: '微信扫码登录',
      sso: '统一身份认证',
      cert: '数字证书登录'
    })[method.value]
);

// ========================== 账号密码 ==========================

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const nickname = ref('');

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
    afterLogin(loginResult);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '操作失败';
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

// ========================== 邮箱验证码 ==========================

const email = ref('');
const emailCode = ref('');
const sending = ref(false);
const countdown = ref(0);
const devCode = ref('');
let countdownTimer: ReturnType<typeof setInterval> | null = null;

async function handleSendCode() {
  errorMsg.value = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errorMsg.value = '请输入正确的邮箱地址';
    return;
  }
  sending.value = true;
  try {
    const res = await sendEmailCodeApi(email.value.trim());
    devCode.value = res.devCode ?? '';
    countdown.value = res.cooldownSec;
    startCountdown();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '验证码发送失败';
  } finally {
    sending.value = false;
  }
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

async function handleEmailLogin() {
  errorMsg.value = '';
  if (!email.value.trim()) {
    errorMsg.value = '请输入邮箱地址';
    return;
  }
  if (!emailCode.value.trim()) {
    errorMsg.value = '请输入邮箱验证码';
    return;
  }
  loading.value = true;
  try {
    afterLogin(await emailLoginApi(email.value.trim(), emailCode.value.trim()));
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    loading.value = false;
  }
}

// ========================== 手机号验证码 ==========================

const phone = ref('');
const phoneCode = ref('');
const phoneSending = ref(false);
const phoneCountdown = ref(0);
const phoneDevCode = ref('');
let phoneCountdownTimer: ReturnType<typeof setInterval> | null = null;

const PHONE_REGEX = /^1[3-9]\d{9}$/;

async function handleSendPhoneCode() {
  errorMsg.value = '';
  if (!PHONE_REGEX.test(phone.value.trim())) {
    errorMsg.value = '请输入正确的 11 位手机号';
    return;
  }
  phoneSending.value = true;
  try {
    const res = await sendPhoneCodeApi(phone.value.trim());
    phoneDevCode.value = res.devCode ?? '';
    phoneCountdown.value = res.cooldownSec;
    if (phoneCountdownTimer) clearInterval(phoneCountdownTimer);
    phoneCountdownTimer = setInterval(() => {
      phoneCountdown.value -= 1;
      if (phoneCountdown.value <= 0 && phoneCountdownTimer) {
        clearInterval(phoneCountdownTimer);
        phoneCountdownTimer = null;
      }
    }, 1000);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '验证码发送失败';
  } finally {
    phoneSending.value = false;
  }
}

async function handlePhoneLogin() {
  errorMsg.value = '';
  if (!PHONE_REGEX.test(phone.value.trim())) {
    errorMsg.value = '请输入正确的 11 位手机号';
    return;
  }
  if (!phoneCode.value.trim()) {
    errorMsg.value = '请输入手机号验证码';
    return;
  }
  loading.value = true;
  try {
    afterLogin(await phoneLoginApi(phone.value.trim(), phoneCode.value.trim()));
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    loading.value = false;
  }
}

// ========================== 微信扫码（模拟） ==========================

const qrScene = ref('');
const qrStatus = ref<WechatQrStatus>('pending');
const qrExpiresIn = ref(0);
let qrTimer: ReturnType<typeof setInterval> | null = null;
let qrTicker: ReturnType<typeof setInterval> | null = null;

const qrStatusText = computed(() => {
  if (!qrScene.value) return '正在生成二维码…';
  if (qrStatus.value === 'scanned') return '已扫码，请在手机端确认登录';
  if (qrStatus.value === 'confirmed') return '登录成功，正在跳转…';
  if (qrStatus.value === 'expired') return '二维码已过期，点击刷新';
  return `请使用微信扫一扫（${qrExpiresIn.value}s 后失效）`;
});

const qrSvg = computed(() => buildQrSvg(qrScene.value || 'mock-qr'));

function buildQrSvg(seedText: string): string {
  const N = 21;
  const cell = 8;
  const pad = 4;
  const total = N * cell + pad * 2;
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const inFinder = (x: number, y: number) => {
    const box = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    return box(0, 0) || box(N - 7, 0) || box(0, N - 7);
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${pad + x * cell}" y="${pad + y * cell}" width="${w * cell}" height="${h * cell}" fill="${fill}"/>`;
  let body = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y)) continue;
      if (rand() < 0.45) body += rect(x, y, 1, 1, '#1a2420');
    }
  }
  const finder = (ox: number, oy: number) =>
    rect(ox, oy, 7, 7, '#1a2420') + rect(ox + 1, oy + 1, 5, 5, '#ffffff') + rect(ox + 2, oy + 2, 3, 3, '#1a2420');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    body +
    finder(0, 0) +
    finder(N - 7, 0) +
    finder(0, N - 7) +
    '</svg>'
  );
}

async function initWechatQr() {
  stopQrPolling();
  errorMsg.value = '';
  try {
    const data = await createWechatQrApi();
    qrScene.value = data.sceneId;
    qrStatus.value = 'pending';
    qrExpiresIn.value = data.expiresIn;
    qrTimer = setInterval(pollQrStatus, 1500);
    qrTicker = setInterval(() => {
      if (qrExpiresIn.value > 0) qrExpiresIn.value -= 1;
    }, 1000);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '二维码生成失败';
  }
}

async function pollQrStatus() {
  if (!qrScene.value) return;
  try {
    const data = await pollWechatQrApi(qrScene.value);
    qrStatus.value = data.status;
    if (data.status === 'confirmed' && data.user && data.token) {
      stopQrPolling();
      afterLogin({ user: data.user, token: data.token });
    } else if (data.status === 'expired') {
      stopQrPolling();
    }
  } catch {
    // 轮询失败静默重试
  }
}

function stopQrPolling() {
  if (qrTimer) clearInterval(qrTimer);
  if (qrTicker) clearInterval(qrTicker);
  qrTimer = null;
  qrTicker = null;
}

async function handleMockScan() {
  errorMsg.value = '';
  try {
    await mockWechatScanApi(qrScene.value);
    qrStatus.value = 'scanned';
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '操作失败';
  }
}

async function handleMockConfirm() {
  errorMsg.value = '';
  try {
    await mockWechatConfirmApi(qrScene.value);
    qrStatus.value = 'confirmed';
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '操作失败';
  }
}

// ========================== 统一认证（模拟） ==========================

const ssoLoading = ref(false);

async function handleSsoLogin() {
  errorMsg.value = '';
  ssoLoading.value = true;
  try {
    afterLogin(await ssoMockLoginApi());
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '统一认证登录失败';
  } finally {
    ssoLoading.value = false;
  }
}

// ========================== 数字证书 ==========================

const certInput = ref<HTMLInputElement | null>(null);
const certFile = ref<File | null>(null);
const dragging = ref(false);
const certLoading = ref(false);

function setCertFile(file: File) {
  errorMsg.value = '';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!['cer', 'crt', 'pem', 'pfx', 'p12'].includes(ext)) {
    errorMsg.value = '仅支持 .cer / .crt / .pem / .pfx 格式的证书文件';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    errorMsg.value = '证书文件不能超过 2MB';
    return;
  }
  certFile.value = file;
}

function handleCertChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) setCertFile(file);
  input.value = '';
}

function handleCertDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) setCertFile(file);
}

async function handleCertLogin() {
  if (!certFile.value) return;
  errorMsg.value = '';
  certLoading.value = true;
  try {
    afterLogin(await certLoginApi(certFile.value));
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '证书登录失败';
  } finally {
    certLoading.value = false;
  }
}

// ========================== 通用 ==========================

function afterLogin(result: LoginResult) {
  const redirect = route.query.redirect as string | undefined;
  if (redirect) {
    router.replace(redirect);
  } else if (result.user.role === 'admin') {
    router.replace('/admin');
  } else {
    router.replace('/');
  }
}

function switchMethod(next: LoginMethod) {
  if (method.value === next) return;
  method.value = next;
  errorMsg.value = '';
  successMsg.value = '';
  devCode.value = '';
  stopQrPolling();
  qrScene.value = '';
  if (next === 'wechat') initWechatQr();
  if (next === 'cert') certFile.value = null;
}

onMounted(async () => {
  loadCaptcha();
  providers.value = await getProvidersApi();
});

onUnmounted(() => {
  stopQrPolling();
  if (countdownTimer) clearInterval(countdownTimer);
});
</script>

<template>
  <div class="login-page split">
    <!-- 左侧品牌展示区 -->
    <div class="hero">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <div class="hero-badge">
          <span class="hero-badge-dot"></span>
          AI 智能导览平台
        </div>
        <h1 class="hero-title">
          漫步西湖<br />
          <span class="hero-title-accent">文化触手可及</span>
        </h1>
        <p class="hero-sub">
          融合 LLM 与 RAG 的沉浸式文化导览系统，让每一处景点都能被听懂、被读透。
        </p>
        <ul class="hero-features">
          <li><span class="hero-feat-icon">✨</span>AI 智能问答与数字人语音交互</li>
          <li><span class="hero-feat-icon">🏛️</span>景点路线 · 文化内容一站式聚合</li>
          <li><span class="hero-feat-icon">📊</span>运营数据可视化大屏</li>
        </ul>
      </div>
      <div class="hero-footer">
        © 第八组 · 西湖文化 AI 导览系统
      </div>
    </div>

    <!-- 右侧登录卡片 -->
    <div class="login-card-wrap">
      <div class="login-card">
        <div class="title-row">
          <div>
            <h2 class="login-title">{{ panelTitle }}</h2>
            <p v-if="method === 'password'" class="login-sub">{{ mode === 'login' ? '使用您的账号密码登录系统' : '填写以下信息创建新账号' }}</p>
          </div>
          <span v-if="demoMode" class="demo-tag">演示模式</span>
        </div>

        <!-- 登录方式切换 -->
        <div class="method-tabs" role="tablist">
          <button
            v-for="tab in methodTabs"
            :key="tab.key"
            type="button"
            role="tab"
            class="method-tab"
            :class="{ active: method === tab.key }"
            :aria-selected="method === tab.key"
            @click="switchMethod(tab.key)"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>

        <!-- 1. 账号密码 -->
        <form v-if="method === 'password'" @submit.prevent="handleSubmit" class="login-form">
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

          <button type="button" class="switch-btn" @click="switchMode">
            {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
          </button>

          <p v-if="mode === 'login'" class="hint">默认管理员：<code>admin / admin123</code></p>
        </form>

        <!-- 2. 邮箱验证码 -->
        <form v-else-if="method === 'email'" @submit.prevent="handleEmailLogin" class="login-form">
          <div class="form-row">
            <label class="label" for="login-email">邮箱</label>
            <input
              id="login-email"
              v-model="email"
              class="input"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
            />
          </div>

          <div class="form-row">
            <label class="label" for="login-email-code">验证码</label>
            <div class="code-row">
              <input
                id="login-email-code"
                v-model="emailCode"
                class="input"
                type="text"
                maxlength="6"
                placeholder="6 位验证码"
                autocomplete="one-time-code"
              />
              <button
                type="button"
                class="btn btn-secondary send-btn"
                :disabled="sending || countdown > 0"
                @click="handleSendCode"
              >
                {{ countdown > 0 ? `${countdown}s 后重发` : (sending ? '发送中...' : '获取验证码') }}
              </button>
            </div>
          </div>

          <p v-if="devCode" class="demo-tip">
            演示模式已模拟发信，验证码：<strong class="nums">{{ devCode }}</strong>
          </p>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>

          <button type="submit" :disabled="loading" class="btn btn-primary submit-btn">
            {{ loading ? '登录中...' : '登录 / 注册' }}
          </button>

          <p class="hint">首次使用邮箱验证码登录会自动创建普通账号</p>
        </form>

        <!-- 3. 手机号验证码 -->
        <form v-else-if="method === 'phone'" @submit.prevent="handlePhoneLogin" class="login-form">
          <div class="form-row">
            <label class="label" for="login-phone">手机号</label>
            <input
              id="login-phone"
              v-model="phone"
              class="input"
              type="tel"
              maxlength="11"
              placeholder="请输入 11 位手机号"
              autocomplete="tel"
            />
          </div>

          <div class="form-row">
            <label class="label" for="login-phone-code">验证码</label>
            <div class="code-row">
              <input
                id="login-phone-code"
                v-model="phoneCode"
                class="input"
                type="text"
                maxlength="6"
                placeholder="6 位验证码"
                autocomplete="one-time-code"
              />
              <button
                type="button"
                class="btn btn-secondary send-btn"
                :disabled="phoneSending || phoneCountdown > 0"
                @click="handleSendPhoneCode"
              >
                {{ phoneCountdown > 0 ? `${phoneCountdown}s 后重发` : (phoneSending ? '发送中...' : '获取验证码') }}
              </button>
            </div>
          </div>

          <p v-if="phoneDevCode" class="demo-tip">
            演示模式已模拟发信，验证码：<strong class="nums">{{ phoneDevCode }}</strong>
          </p>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>

          <button type="submit" :disabled="loading" class="btn btn-primary submit-btn">
            {{ loading ? '登录中...' : '登录 / 注册' }}
          </button>

          <p class="hint">首次使用手机号验证码登录会自动创建普通账号</p>
        </form>

        <!-- 4. 微信扫码 -->
        <div v-else-if="method === 'wechat'" class="wechat-panel">
          <div class="qr-box">
            <div class="qr-img" v-html="qrSvg"></div>
            <div v-if="qrStatus === 'scanned'" class="qr-mask">
              <span>已扫码<br />请在手机端确认</span>
            </div>
            <div v-if="qrStatus === 'expired'" class="qr-mask qr-expired" @click="initWechatQr">
              <span>二维码已过期<br />点击刷新</span>
            </div>
          </div>

          <p class="qr-status">{{ qrStatusText }}</p>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>

          <div class="demo-actions">
            <button
              type="button"
              class="btn btn-secondary demo-btn"
              :disabled="qrStatus !== 'pending'"
              @click="handleMockScan"
            >
              模拟手机扫码
            </button>
            <button
              type="button"
              class="btn btn-secondary demo-btn"
              :disabled="qrStatus !== 'scanned'"
              @click="handleMockConfirm"
            >
              模拟手机确认
            </button>
          </div>

          <p class="hint">演示模式：无需真实微信，用上方按钮模拟手机端操作</p>
        </div>

        <!-- 4. 统一身份认证 -->
        <div v-else-if="method === 'sso'" class="sso-panel">
          <div class="sso-card">
            <div class="sso-logo">
              <span class="sso-mark">SSO</span>
              <span class="sso-name">统一身份认证平台</span>
            </div>
            <p class="sso-desc">使用学校统一身份认证账号登录导览系统，无需单独注册</p>
            <button type="button" class="btn btn-primary submit-btn" :disabled="ssoLoading" @click="handleSsoLogin">
              {{ ssoLoading ? '认证中...' : '前往统一认证登录' }}
            </button>
          </div>

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>
          <p class="hint">演示模式：点击后由本地模拟认证平台返回票据，无需真实学校账号</p>
        </div>

        <!-- 5. 数字证书 -->
        <div v-else class="cert-panel">
          <div
            class="drop-zone"
            :class="{ dragging, selected: !!certFile }"
            @click="certInput?.click()"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="handleCertDrop"
          >
            <template v-if="!certFile">
              <div class="drop-title">点击或拖拽上传证书文件</div>
              <div class="drop-sub">支持 .cer / .crt / .pem / .pfx，不超过 2MB</div>
            </template>
            <template v-else>
              <div class="drop-title">{{ certFile.name }}</div>
              <div class="drop-sub">{{ (certFile.size / 1024).toFixed(1) }} KB · 点击可重新选择</div>
            </template>
          </div>
          <input
            ref="certInput"
            class="file-hidden"
            type="file"
            accept=".cer,.crt,.pem,.pfx,.p12"
            @change="handleCertChange"
          />

          <p v-if="errorMsg" class="error-bar form-error">{{ errorMsg }}</p>

          <button type="button" class="btn btn-primary submit-btn" :disabled="certLoading || !certFile" @click="handleCertLogin">
            {{ certLoading ? '验证中...' : '验证证书并登录' }}
          </button>

          <p class="hint">演示模式：仅校验文件可读并计算证书指纹，不做真实 CA 链验签</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================
   登录页：左右分屏布局
   左 55% = 品牌展示区（西湖风景 + 青绿渐变遮罩 + slogan）
   右 45% = 登录卡片
   ============================================================ */

.login-page {
  min-height: 100vh;
  display: flex;
  color: var(--color-text);
  font-family: var(--font-sans);
  background: #ffffff;
}

/* ---------- 左侧品牌展示区 ---------- */
.hero {
  position: relative;
  flex: 0 0 55%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px 56px;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background-image: url('https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=West%20Lake%20Hangzhou%20spring%20view%20sunset%20reflection%20ancient%20Chinese%20style&image_size=landscape_16_9');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
}

/* 青绿渐变遮罩 + 暗化，让上面的白字清晰可读 */
.hero-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.85) 0%, rgba(7, 89, 85, 0.9) 100%);
}

.hero-content {
  position: relative;
  z-index: 1;
  margin-top: auto;
  margin-bottom: auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 28px;
  letter-spacing: 0.02em;
}
.hero-badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
}

.hero-title {
  font-family: var(--font-serif);
  font-size: 52px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.2;
  margin: 0 0 20px;
  letter-spacing: 0.02em;
}
.hero-title-accent {
  background: linear-gradient(90deg, #99f6e4 0%, #ffffff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-sub {
  font-size: 16px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 40px;
  max-width: 460px;
}

.hero-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hero-features li {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.5;
}
.hero-feat-icon {
  font-size: 16px;
  width: 24px;
  flex-shrink: 0;
}

.hero-footer {
  position: relative;
  z-index: 1;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  letter-spacing: 0.05em;
}

/* ---------- 右侧登录卡片区 ---------- */
.login-card-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #ffffff;
  overflow-y: auto;
}

.login-card {
  width: 100%;
  max-width: 420px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.login-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.3;
}
.login-sub {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-2);
  line-height: 1.5;
}

.demo-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 100px;
  padding: 4px 10px;
  font-weight: 500;
}

/* ---------- 登录方式标签：分段控件 ---------- */
.method-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: 4px;
  background: var(--color-bg);
  border-radius: 12px;
  margin-bottom: 28px;
  border: 1px solid var(--color-border);
}
.method-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 4px;
  background: none;
  border: none;
  border-radius: 10px;
  font-family: var(--font-sans);
  color: var(--color-text-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.method-tab:hover {
  color: var(--color-text);
  background: rgba(15, 118, 110, 0.06);
}
.method-tab.active {
  background: #ffffff;
  color: var(--color-primary);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(15, 118, 110, 0.12), 0 0 0 1px rgba(15, 118, 110, 0.1);
}
.tab-icon {
  font-size: 20px;
  line-height: 1;
}
.tab-label {
  font-size: 11px;
  white-space: nowrap;
}

/* ---------- 表单 ---------- */
.login-form .form-row {
  margin-bottom: var(--space-4);
}
.form-error {
  margin: 0 0 var(--space-4);
}

.captcha-row,
.code-row {
  display: flex;
  gap: var(--space-3);
  align-items: stretch;
}
.captcha-row .input,
.code-row .input {
  flex: 1;
  min-width: 0;
}
.captcha-img {
  flex: 0 0 auto;
  width: 120px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
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
.send-btn {
  flex: 0 0 auto;
  width: 118px;
  height: 40px;
}

.success-bar {
  color: var(--color-primary);
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
}

.switch-btn {
  display: block;
  width: 100%;
  margin-top: 16px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--color-primary);
  cursor: pointer;
  font-family: var(--font-sans);
}
.switch-btn:hover {
  text-decoration: underline;
}

.hint {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-2);
  margin: 20px 0 0;
  line-height: 1.6;
}
.hint code {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* 演示提示条 */
.demo-tip {
  margin: 0 0 16px;
  padding: 10px 14px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-radius: 8px;
  font-size: 13px;
}
.demo-tip strong {
  letter-spacing: 0.15em;
  font-size: 15px;
}

/* ---------- 微信扫码 ---------- */
.wechat-panel {
  text-align: center;
}
.qr-box {
  position: relative;
  width: 200px;
  height: 200px;
  margin: 0 auto var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.qr-img {
  width: 100%;
  height: 100%;
}
.qr-img :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.qr-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.7;
}
.qr-expired {
  cursor: pointer;
  color: var(--color-primary);
}
.qr-status {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--color-text-2);
}
.demo-actions {
  display: flex;
  gap: 12px;
}
.demo-btn {
  flex: 1;
  height: 40px;
}

/* ---------- 统一认证 ---------- */
.sso-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 28px 24px;
  background: var(--color-bg);
  text-align: center;
}
.sso-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.sso-mark {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--color-primary);
  border-radius: 6px;
  padding: 4px 10px;
  letter-spacing: 0.08em;
}
.sso-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}
.sso-desc {
  margin: 0 0 24px;
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.6;
}

/* ---------- 数字证书 ---------- */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 140px;
  padding: var(--space-4);
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.drop-zone.selected {
  border-style: solid;
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.drop-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  word-break: break-all;
}
.drop-sub {
  font-size: 12px;
  color: var(--color-text-2);
}
.file-hidden {
  display: none;
}

/* ---------- 响应式：768px 以下切换单栏 ---------- */
@media (max-width: 900px) {
  .hero {
    padding: 40px;
  }
  .hero-title {
    font-size: 40px;
  }
}

@media (max-width: 768px) {
  .login-page.split {
    flex-direction: column;
  }
  .hero {
    flex: none;
    min-height: 240px;
    padding: 32px 28px;
  }
  .hero-content {
    margin: 0;
  }
  .hero-title {
    font-size: 28px;
  }
  .hero-sub {
    font-size: 13px;
    margin-bottom: 0;
  }
  .hero-features {
    display: none;
  }
  .hero-footer {
    display: none;
  }
  .login-card-wrap {
    padding: 32px 24px;
  }
  .method-tabs {
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
    padding: 3px;
  }
  .method-tab {
    padding: 8px 2px;
    gap: 4px;
  }
  .tab-icon {
    font-size: 16px;
  }
  .tab-label {
    font-size: 10px;
  }
}
</style>
