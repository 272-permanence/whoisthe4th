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

/** 登录方式：账号密码 / 邮箱验证码 / 微信扫码 / 统一认证 / 数字证书 */
type LoginMethod = 'password' | 'email' | 'wechat' | 'sso' | 'cert';

const methodTabs: { key: LoginMethod; label: string }[] = [
  { key: 'password', label: '账号密码' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信扫码' },
  { key: 'sso', label: '统一认证' },
  { key: 'cert', label: '证书' }
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
  return !!p && p.email.mode === 'mock' && p.wechat.mode === 'mock' && p.sso.mode === 'mock' && p.cert.mode === 'mock';
});

const panelTitle = computed(
  () =>
    ({
      password: mode.value === 'login' ? '登录' : '注册',
      email: '邮箱验证码登录',
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
    afterLogin(loginResult);
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

// ========================== 邮箱验证码 ==========================

const email = ref('');
const emailCode = ref('');
const sending = ref(false);
const countdown = ref(0);
const devCode = ref('');
let countdownTimer: ReturnType<typeof setInterval> | null = null;

/** 发送邮箱验证码并开启 60 秒重发倒计时 */
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

/** 二维码图案由 sceneId 哈希生成，仅作视觉占位 */
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

/** 创建二维码并开始轮询 */
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
    // 轮询失败静默重试，避免打断用户
  }
}

function stopQrPolling() {
  if (qrTimer) clearInterval(qrTimer);
  if (qrTicker) clearInterval(qrTicker);
  qrTimer = null;
  qrTicker = null;
}

/** 模拟手机扫码 */
async function handleMockScan() {
  errorMsg.value = '';
  try {
    await mockWechatScanApi(qrScene.value);
    qrStatus.value = 'scanned';
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '操作失败';
  }
}

/** 模拟手机确认登录 */
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

/** 选择/拖拽后的本地校验 */
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

/** 登录成功后的统一跳转：admin 进后台，普通用户进用户端 */
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

/** 切换登录方式时清理上一个通道的临时状态 */
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
  <div class="login-page">
    <div class="login-wrap">
      <div class="brand">
        <div class="brand-name">西湖文化 AI 导览</div>
        <div class="brand-sub">LLM + RAG · 智能导览系统</div>
      </div>

      <div class="login-card">
        <div class="title-row">
          <h2 class="login-title">{{ panelTitle }}</h2>
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
            {{ tab.label }}
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

        <!-- 3. 微信扫码 -->
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
  width: min(460px, 100%);
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

.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.login-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
  color: var(--color-text);
}
.demo-tag {
  font-size: var(--text-meta);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: var(--radius-full);
  padding: 2px var(--space-2);
}

/* 登录方式标签：等分 5 列，选中态用主色下划线 */
.method-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-6);
}
.method-tab {
  padding: var(--space-2) 0 var(--space-3);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: var(--text-caption);
  font-family: var(--font-sans);
  color: var(--color-text-2);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}
.method-tab:hover {
  color: var(--color-text);
}
.method-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}

.login-form .form-row {
  margin-bottom: var(--space-4);
}

.form-error {
  margin: 0 0 var(--space-4);
}

/* 验证码 */
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
  line-height: 1.6;
}
.hint code {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 1px var(--space-2);
  border-radius: var(--space-1);
}

/* 演示提示条 */
.demo-tip {
  margin: 0 0 var(--space-4);
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption);
}
.demo-tip strong {
  letter-spacing: 0.15em;
  font-size: var(--text-body);
}

/* 微信扫码 */
.wechat-panel {
  text-align: center;
}
.qr-box {
  position: relative;
  width: 180px;
  height: 180px;
  margin: 0 auto var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #fff;
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
  background: rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption);
  color: var(--color-text);
  line-height: 1.7;
}
.qr-expired {
  cursor: pointer;
  color: var(--color-primary);
}
.qr-status {
  margin: 0 0 var(--space-4);
  font-size: var(--text-caption);
  color: var(--color-text-2);
}
.demo-actions {
  display: flex;
  gap: var(--space-3);
}
.demo-btn {
  flex: 1;
  height: 36px;
}

/* 统一认证 */
.sso-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  background: var(--color-bg);
}
.sso-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.sso-mark {
  font-size: var(--text-meta);
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  letter-spacing: 0.05em;
}
.sso-name {
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--color-text);
}
.sso-desc {
  margin: 0 0 var(--space-6);
  font-size: var(--text-caption);
  color: var(--color-text-2);
  line-height: 1.6;
}

/* 数字证书 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 132px;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
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
}
.drop-title {
  font-size: var(--text-body);
  color: var(--color-text);
  word-break: break-all;
}
.drop-sub {
  font-size: var(--text-meta);
  color: var(--color-text-2);
}
.file-hidden {
  display: none;
}

@media (max-width: 640px) {
  .login-card {
    padding: var(--space-6);
  }
  .method-tabs {
    gap: 0;
  }
  .method-tab {
    font-size: var(--text-meta);
  }
}
</style>
