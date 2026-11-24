<script setup lang="ts">
/**
 * @file 数据运营大屏
 * @author 第八组
 * @date 2026-10-15
 * @description 实时展示服务人次、热门问答、情感分布、问答趋势
 */
import { ref, onMounted, onBeforeUnmount, shallowRef, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { getStats, connectStatsStream, type AnalyticsStats } from '../api/analytics';
import { apiFetch } from '../common/apiClient';

const router = useRouter();

/** 返回项目首页（不用 router.back，避免退到项目外的页面） */
function goBack(): void {
  router.push('/home');
}

// ==================== 日志审计相关 ====================
const activeTab = ref<'stats' | 'audit' | 'profile'>('stats');

const hotPoisChart = shallowRef<echarts.ECharts | null>(null);
const hotPois = ref<{ poiId: number; name: string; visitCount: number }[]>([]);

const abnormalLogins = ref<{ ip: string; failCount: number; firstFail: string; lastFail: string }[]>([]);

const traceInput = ref('');
const traceResult = ref<{
  traceId: string;
  operationCount: number;
  errorCount: number;
  loginCount: number;
  timeline: Record<string, unknown>[];
} | null>(null);
const traceLoading = ref(false);

/** 加载热门景点 Top10 */
async function loadHotPois() {
  try {
    const data = await apiFetch<{ poiId: number; name: string; visitCount: number }[]>(
      '/behaviors/hot-pois',
      { apiPrefix: '/api/v1/analytics' }
    );
    hotPois.value = data;
    renderHotPoisChart();
  } catch (e) {
    console.error('[Audit] 热门景点加载失败', e);
  }
}

/** 渲染热门景点柱状图 */
function renderHotPoisChart() {
  if (!hotPoisChart.value) return;
  const names = hotPois.value.map(p => p.name);
  const counts = hotPois.value.map(p => p.visitCount);
  hotPoisChart.value.setOption({
    title: { text: '热门景点 TOP10', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { color: '#ccc', interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: '#ccc' } },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#ff9c6e' },
      barWidth: '50%'
    }]
  });
}

/** 加载异常登录记录 */
async function loadAbnormalLogins() {
  try {
    const data = await apiFetch<{ ip: string; failCount: number; firstFail: string; lastFail: string }[]>(
      '/audit/login-abnormal',
      { apiPrefix: '/api/v1/analytics' }
    );
    abnormalLogins.value = data;
  } catch (e) {
    console.error('[Audit] 异常登录加载失败', e);
  }
}

/** 查询 trace 全链路 */
async function queryTrace() {
  const id = traceInput.value.trim();
  if (!id) return;
  traceLoading.value = true;
  traceResult.value = null;
  try {
    const data = await apiFetch<{
      traceId: string; operationCount: number; errorCount: number;
      loginCount: number; timeline: Record<string, unknown>[];
    }>(`/trace/${encodeURIComponent(id)}`, { apiPrefix: '/api/v1/logs' });
    traceResult.value = data;
  } catch (e) {
    console.error('[Audit] Trace 查询失败', e);
  } finally {
    traceLoading.value = false;
  }
}

/** 切换到日志审计 tab 时加载数据 */
async function switchToAudit() {
  activeTab.value = 'audit';
  // 必须等 DOM 渲染完再 init：v-if 的容器在 activeTab 变更前不存在，
  // 直接 getElementById 会拿到 null，echarts.init(null) 抛错会导致后续请求全部中断
  await nextTick();
  const el = document.getElementById('hot-pois-chart');
  if (el) {
    // 切走再切回时容器已被 v-if 销毁重建，旧实例绑定的是失效 DOM，必须重新 init
    if (!hotPoisChart.value || hotPoisChart.value.getDom() !== el) {
      hotPoisChart.value?.dispose();
      hotPoisChart.value = echarts.init(el);
    }
    await Promise.all([loadHotPois(), loadAbnormalLogins()]);
  }
}

// ==================== 用户画像相关 ====================
interface ProfileUser {
  userId: number;
  eventCount: number;
  lastActive: string;
}

interface UserProfile {
  userId: number;
  days: number;
  totalEvents: number;
  clickCount: number;
  likeCount: number;
  favoriteCount: number;
  shareCount: number;
  dwellCount: number;
  avgDwellSeconds: number;
  lastActiveAt: string | null;
  activeHours: number[];
  topTargets: { resourceType: string; resourceId: string; name: string; count: number }[];
  tags: { label: string; weight: number }[];
  recentEvents: { action: string; resourceType: string; resourceId: string; pagePath: string; createdAt: string }[];
  updatedAt: string;
}

const profileUsers = ref<ProfileUser[]>([]);
const selectedUserId = ref<number>(readInitialUserId());
const profile = ref<UserProfile | null>(null);
const profileLoading = ref(false);
const profileError = ref('');
const profileActionChart = shallowRef<echarts.ECharts | null>(null);
const profileHourChart = shallowRef<echarts.ECharts | null>(null);

/** 默认选中当前登录用户，读不到时回落到 1 */
function readInitialUserId(): number {
  try {
    const raw = localStorage.getItem('whoisthe4th_user') || localStorage.getItem('user');
    const parsed = raw ? (JSON.parse(raw) as { id?: unknown }) : null;
    const id = Number(parsed?.id);
    if (Number.isFinite(id) && id >= 0) return id;
  } catch {
    // 解析失败使用默认值
  }
  return 1;
}

/** 加载有埋点数据的用户列表 */
async function loadProfileUsers(): Promise<void> {
  try {
    const data = await apiFetch<ProfileUser[]>('/users', { apiPrefix: '/api/v1/analytics' });
    profileUsers.value = data;
    if (data.length > 0 && !data.some(u => u.userId === selectedUserId.value)) {
      selectedUserId.value = data[0].userId;
    }
  } catch (e) {
    console.error('[Profile] 用户列表加载失败', e);
  }
}

/** 加载单个用户的行为画像 */
async function loadProfile(): Promise<void> {
  profileLoading.value = true;
  profileError.value = '';
  try {
    profile.value = await apiFetch<UserProfile>(
      `/users/profile?userId=${selectedUserId.value}&days=7`,
      { apiPrefix: '/api/v1/analytics' }
    );
    await nextTick();
    renderProfileCharts();
  } catch (e) {
    profileError.value = e instanceof Error ? e.message : '画像加载失败';
  } finally {
    profileLoading.value = false;
  }
}

/** 渲染画像的两张图：行为分布 + 活跃时段 */
function renderProfileCharts(): void {
  const data = profile.value;
  if (!data) return;

  const actionEl = document.getElementById('profile-action-chart');
  if (actionEl) {
    // v-if 切走再切回会重建 DOM，旧实例必须丢弃
    if (!profileActionChart.value || profileActionChart.value.getDom() !== actionEl) {
      profileActionChart.value?.dispose();
      profileActionChart.value = echarts.init(actionEl);
    }
    profileActionChart.value.setOption({
      title: { text: '行为分布', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: ['点击', '点赞', '收藏', '分享', '停留'], axisLabel: { color: '#ccc' } },
      yAxis: { type: 'value', axisLabel: { color: '#ccc' }, minInterval: 1 },
      series: [{
        type: 'bar',
        barWidth: '46%',
        data: [
          { value: data.clickCount, itemStyle: { color: '#4fc3f7' } },
          { value: data.likeCount, itemStyle: { color: '#ff9c6e' } },
          { value: data.favoriteCount, itemStyle: { color: '#faad14' } },
          { value: data.shareCount, itemStyle: { color: '#36cfc9' } },
          { value: data.dwellCount, itemStyle: { color: '#b37feb' } },
        ],
      }],
    });
  }

  const hourEl = document.getElementById('profile-hour-chart');
  if (hourEl) {
    if (!profileHourChart.value || profileHourChart.value.getDom() !== hourEl) {
      profileHourChart.value?.dispose();
      profileHourChart.value = echarts.init(hourEl);
    }
    profileHourChart.value.setOption({
      title: { text: '活跃时段分布', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => `${i}时`),
        axisLabel: { color: '#ccc', interval: 2 },
      },
      yAxis: { type: 'value', axisLabel: { color: '#ccc' }, minInterval: 1 },
      series: [{
        type: 'line',
        smooth: true,
        data: data.activeHours,
        areaStyle: { color: 'rgba(79, 195, 247, 0.2)' },
        lineStyle: { color: '#4fc3f7', width: 2 },
        itemStyle: { color: '#4fc3f7' },
      }],
    });
  }
}

/** 切换到用户画像 tab */
async function switchToProfile(): Promise<void> {
  activeTab.value = 'profile';
  await nextTick();
  await loadProfileUsers();
  await loadProfile();
}

/** 点击用户 chip 切换画像对象 */
function selectProfileUser(userId: number): void {
  if (selectedUserId.value === userId) return;
  selectedUserId.value = userId;
  void loadProfile();
}

/** 行为类型中文名 */
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    click: '点击',
    like: '点赞',
    favorite: '收藏',
    share: '分享',
    dwell: '停留',
  };
  return map[action] ?? action;
}

/** 时间格式化 */
function formatTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

const totalVisits = ref(0);
const todayVisits = ref(0);
const updatedAt = ref('');

// 失物招领指标
const lfTotal = ref(0);
const lfTodayCount = ref(0);
const lfOpenCount = ref(0);
const lfResolvedCount = ref(0);
const lfLostCount = ref(0);
const lfFoundCount = ref(0);

const sentimentChart = shallowRef<echarts.ECharts | null>(null);
const hotChart = shallowRef<echarts.ECharts | null>(null);
const trendChart = shallowRef<echarts.ECharts | null>(null);
const lfStatusChart = shallowRef<echarts.ECharts | null>(null);
const lfCategoryChart = shallowRef<echarts.ECharts | null>(null);

let closeStream: (() => void) | null = null;

onMounted(async () => {
  initCharts();
  // 初次加载数据
  const stats = await getStats();
  updateDashboard(stats);
  // 建立 SSE 实时连接
  closeStream = connectStatsStream(updateDashboard);
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  closeStream?.();
  window.removeEventListener('resize', resizeCharts);
  sentimentChart.value?.dispose();
  hotChart.value?.dispose();
  trendChart.value?.dispose();
  lfStatusChart.value?.dispose();
  lfCategoryChart.value?.dispose();
  hotPoisChart.value?.dispose();
  profileActionChart.value?.dispose();
  profileHourChart.value?.dispose();
});

/**
 * 初始化所有图表实例
 */
function initCharts() {
  sentimentChart.value = echarts.init(document.getElementById('sentiment-chart')!);
  hotChart.value = echarts.init(document.getElementById('hot-chart')!);
  trendChart.value = echarts.init(document.getElementById('trend-chart')!);
  lfStatusChart.value = echarts.init(document.getElementById('lf-status-chart')!);
  lfCategoryChart.value = echarts.init(document.getElementById('lf-category-chart')!);
}

/**
 * 更新大屏数据
 */
function updateDashboard(stats: AnalyticsStats) {
  totalVisits.value = stats.totalVisits;
  todayVisits.value = stats.todayVisits;
  updatedAt.value = stats.updatedAt;

  // 失物招领指标
  if (stats.lostFound) {
    lfTotal.value = stats.lostFound.total;
    lfTodayCount.value = stats.lostFound.todayCount;
    lfOpenCount.value = stats.lostFound.statusDist.open;
    lfResolvedCount.value = stats.lostFound.statusDist.resolved;
    lfLostCount.value = stats.lostFound.typeDist.lost;
    lfFoundCount.value = stats.lostFound.typeDist.found;
    updateLfStatusChart(stats.lostFound.statusDist, stats.lostFound.typeDist);
    updateLfCategoryChart(stats.lostFound.topCategories);
  }

  updateSentimentChart(stats.sentimentDist);
  updateHotChart(stats.hotQuestions);
  updateTrendChart(stats.hourlyTrend);
}

/**
 * 失物招领状态 + 类型分布饼图（双饼图）
 */
function updateLfStatusChart(
  statusDist: AnalyticsStats['lostFound']['statusDist'],
  typeDist: AnalyticsStats['lostFound']['typeDist']
) {
  lfStatusChart.value?.setOption({
    title: [
      { text: '失物招领状态分布', left: '25%', top: '5%', textStyle: { color: '#fff', fontSize: 14 } },
      { text: '丢失 vs 捡到', left: '75%', top: '5%', textStyle: { color: '#fff', fontSize: 14 } }
    ],
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['30%', '55%'],
        center: ['25%', '60%'],
        label: { color: '#fff' },
        data: [
          { value: statusDist.open, name: '待处理', itemStyle: { color: '#faad14' } },
          { value: statusDist.resolved, name: '已解决', itemStyle: { color: '#52c41a' } },
          { value: statusDist.expired, name: '已过期', itemStyle: { color: '#8c8c8c' } }
        ]
      },
      {
        type: 'pie',
        radius: ['30%', '55%'],
        center: ['75%', '60%'],
        label: { color: '#fff' },
        data: [
          { value: typeDist.lost, name: '丢失', itemStyle: { color: '#ff4d4f' } },
          { value: typeDist.found, name: '捡到', itemStyle: { color: '#1890ff' } }
        ]
      }
    ]
  });
}

/**
 * 失物招领热门分类 TOP5 横向柱状图
 */
function updateLfCategoryChart(categories: AnalyticsStats['lostFound']['topCategories']) {
  const names = categories.map(c => c.category);
  const counts = categories.map(c => c.count);

  lfCategoryChart.value?.setOption({
    title: { text: '失物招领热门分类 TOP5', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#ccc' } },
    yAxis: { type: 'category', data: names, axisLabel: { color: '#ccc' } },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#b37feb' },
      barWidth: '50%',
      label: { show: true, position: 'right', color: '#fff' }
    }]
  });
}

/**
 * 情感分布饼图
 */
function updateSentimentChart(dist: AnalyticsStats['sentimentDist']) {
  sentimentChart.value?.setOption({
    title: { text: '用户情感分布', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#ccc' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      label: { color: '#fff' },
      data: [
        { value: dist.positive, name: '正面', itemStyle: { color: '#52c41a' } },
        { value: dist.neutral, name: '中性', itemStyle: { color: '#1890ff' } },
        { value: dist.negative, name: '负面', itemStyle: { color: '#ff4d4f' } }
      ]
    }]
  });
}

/**
 * 热门问答 TOP10 柱状图
 */
function updateHotChart(questions: AnalyticsStats['hotQuestions']) {
  const names = questions.map(q => q.message.length > 12 ? q.message.slice(0, 12) + '...' : q.message);
  const counts = questions.map(q => q.count);

  hotChart.value?.setOption({
    title: { text: '热门问答 TOP10', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { color: '#ccc', interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: '#ccc' } },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#36cfc9' },
      barWidth: '50%'
    }]
  });
}

/**
 * 近 24 小时问答趋势折线图
 */
function updateTrendChart(trend: AnalyticsStats['hourlyTrend']) {
  const hours = trend.map(t => t.hour);
  const counts = trend.map(t => t.count);

  trendChart.value?.setOption({
    title: { text: '近 24 小时问答量趋势', left: 'center', textStyle: { color: '#fff', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: hours, axisLabel: { color: '#ccc' } },
    yAxis: { type: 'value', axisLabel: { color: '#ccc' } },
    series: [{
      type: 'line',
      data: counts,
      smooth: true,
      areaStyle: { color: 'rgba(54, 207, 201, 0.2)' },
      lineStyle: { color: '#36cfc9', width: 2 },
      itemStyle: { color: '#36cfc9' }
    }]
  });
}

function resizeCharts() {
  sentimentChart.value?.resize();
  hotChart.value?.resize();
  trendChart.value?.resize();
  lfStatusChart.value?.resize();
  lfCategoryChart.value?.resize();
  hotPoisChart.value?.resize();
  profileActionChart.value?.resize();
  profileHourChart.value?.resize();
}
</script>

<template>
  <div class="dashboard">
    <!-- 顶部标题栏 -->
    <header class="dashboard-header">
      <div class="header-left">
        <button class="back-btn" aria-label="返回上一页" @click="goBack">
          <span class="back-arrow">‹</span>
          <span class="back-text">返回</span>
        </button>
        <h1>景区导览 AI 数字人 · 数据运营大屏</h1>
      </div>
      <span class="update-time">更新时间：{{ updatedAt }}</span>
    </header>

    <!-- Tab 切换 -->
    <nav class="tab-nav">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'stats' }"
        @click="activeTab = 'stats'"
      >数据运营</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'audit' }"
        @click="switchToAudit"
      >日志审计</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'profile' }"
        @click="switchToProfile"
      >用户画像</button>
    </nav>

    <!-- 数据运营 Tab -->
    <template v-if="activeTab === 'stats'">
    <!-- 核心指标卡片 -->
    <section class="stat-cards">
      <div class="card">
        <div class="card-label">累计服务人次</div>
        <div class="card-value">{{ totalVisits.toLocaleString() }}</div>
      </div>
      <div class="card">
        <div class="card-label">今日服务人次</div>
        <div class="card-value">{{ todayVisits.toLocaleString() }}</div>
      </div>
      <div class="card">
        <div class="card-label">失物招领总数</div>
        <div class="card-value">{{ lfTotal.toLocaleString() }}</div>
        <div class="card-sub">今日新增 {{ lfTodayCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">待处理</div>
        <div class="card-value" style="color: #faad14">{{ lfOpenCount.toLocaleString() }}</div>
        <div class="card-sub">已解决 {{ lfResolvedCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">丢失 / 捡到</div>
        <div class="card-value">{{ lfLostCount }}<span class="card-unit">/</span>{{ lfFoundCount }}</div>
      </div>
    </section>

    <!-- 图表区 -->
    <section class="charts">
      <div class="chart-box">
        <div id="sentiment-chart" class="chart"></div>
      </div>
      <div class="chart-box">
        <div id="hot-chart" class="chart"></div>
      </div>
      <div class="chart-box">
        <div id="trend-chart" class="chart"></div>
      </div>
      <div class="chart-box">
        <div id="lf-status-chart" class="chart"></div>
      </div>
      <div class="chart-box full-width">
        <div id="lf-category-chart" class="chart"></div>
      </div>
    </section>
    </template>

    <!-- 日志审计 Tab -->
    <template v-if="activeTab === 'audit'">
    <section class="charts">
      <!-- 热门景点柱状图 -->
      <div class="chart-box full-width">
        <div id="hot-pois-chart" class="chart"></div>
      </div>

      <!-- 异常登录列表 -->
      <div class="chart-box">
        <h3 class="audit-title">异常登录（同 IP 1 小时内 ≥3 次失败）</h3>
        <div v-if="abnormalLogins.length === 0" class="empty-tip">暂无异常登录记录</div>
        <table v-else class="audit-table">
          <thead>
            <tr><th>IP</th><th>失败次数</th><th>首次失败</th><th>最近失败</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in abnormalLogins" :key="item.ip">
              <td>{{ item.ip }}</td>
              <td class="danger">{{ item.failCount }}</td>
              <td>{{ item.firstFail }}</td>
              <td>{{ item.lastFail }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Trace 全链路查询 -->
      <div class="chart-box">
        <h3 class="audit-title">全链路追踪</h3>
        <div class="trace-query">
          <input
            v-model="traceInput"
            class="trace-input"
            placeholder="输入 traceId 查询完整链路"
            @keyup.enter="queryTrace"
          />
          <button class="trace-btn" @click="queryTrace" :disabled="traceLoading">
            {{ traceLoading ? '查询中...' : '查询' }}
          </button>
        </div>
        <div v-if="traceResult" class="trace-result">
          <div class="trace-summary">
            操作 <b>{{ traceResult.operationCount }}</b> 条 ·
            错误 <b>{{ traceResult.errorCount }}</b> 条 ·
            登录 <b>{{ traceResult.loginCount }}</b> 条
          </div>
          <div class="trace-timeline">
            <div
              v-for="(item, idx) in traceResult.timeline"
              :key="idx"
              class="trace-item"
              :class="'type-' + item.log_type"
            >
              <span class="trace-time">{{ String(item.created_at) }}</span>
              <span class="trace-tag">{{ item.log_type }}</span>
              <span class="trace-detail">
                {{ item.api_path || item.error_type || item.login_result }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
    </template>

    <!-- 用户画像 Tab -->
    <template v-if="activeTab === 'profile'">
    <section class="profile-toolbar">
      <div class="user-chips">
        <span class="profile-hint">选择用户：</span>
        <button
          v-for="user in profileUsers"
          :key="user.userId"
          class="user-chip"
          :class="{ active: selectedUserId === user.userId }"
          @click="selectProfileUser(user.userId)"
        >
          用户 #{{ user.userId }}<em>{{ user.eventCount }}</em>
        </button>
        <span v-if="profileUsers.length === 0" class="profile-hint">
          暂无埋点数据，请先在移动端点几个景点、点赞或收藏
        </span>
      </div>
      <button class="trace-btn" :disabled="profileLoading" @click="loadProfile">
        {{ profileLoading ? '加载中...' : '刷新画像' }}
      </button>
    </section>

    <p v-if="profileError" class="empty-tip">{{ profileError }}</p>

    <section v-if="profile" class="stat-cards profile-cards">
      <div class="card">
        <div class="card-label">行为总数</div>
        <div class="card-value">{{ profile.totalEvents }}</div>
        <div class="card-sub">近 {{ profile.days }} 天</div>
      </div>
      <div class="card">
        <div class="card-label">点击</div>
        <div class="card-value">{{ profile.clickCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">点赞</div>
        <div class="card-value">{{ profile.likeCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">收藏</div>
        <div class="card-value">{{ profile.favoriteCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">分享</div>
        <div class="card-value">{{ profile.shareCount }}</div>
      </div>
      <div class="card">
        <div class="card-label">平均停留</div>
        <div class="card-value">{{ profile.avgDwellSeconds }}<span class="card-unit">秒</span></div>
        <div class="card-sub">停留 {{ profile.dwellCount }} 次</div>
      </div>
    </section>

    <section v-if="profile" class="charts">
      <div class="chart-box">
        <div id="profile-action-chart" class="chart"></div>
      </div>
      <div class="chart-box">
        <div id="profile-hour-chart" class="chart"></div>
      </div>

      <div class="chart-box">
        <h3 class="audit-title">画像标签</h3>
        <div v-if="profile.tags.length === 0" class="empty-tip">暂无标签，多产生一些行为后再看</div>
        <div v-else class="tag-list">
          <span v-for="tag in profile.tags" :key="tag.label" class="tag-chip">
            {{ tag.label }}<b>{{ tag.weight }}</b>
          </span>
        </div>

        <h3 class="audit-title tag-subtitle">偏好对象 TOP</h3>
        <div v-if="profile.topTargets.length === 0" class="empty-tip">暂无偏好对象</div>
        <table v-else class="audit-table">
          <thead>
            <tr><th>对象</th><th>类型</th><th>次数</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in profile.topTargets" :key="`${item.resourceType}:${item.resourceId}`">
              <td>{{ item.name }}</td>
              <td>{{ item.resourceType }}</td>
              <td>{{ item.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="chart-box">
        <h3 class="audit-title">最近行为</h3>
        <div v-if="profile.recentEvents.length === 0" class="empty-tip">暂无行为记录</div>
        <table v-else class="audit-table">
          <thead>
            <tr><th>行为</th><th>对象</th><th>页面</th><th>时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in profile.recentEvents" :key="idx">
              <td>{{ actionLabel(item.action) }}</td>
              <td>{{ item.resourceType }}#{{ item.resourceId }}</td>
              <td>{{ item.pagePath }}</td>
              <td>{{ formatTime(item.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
  padding: 24px;
  color: #fff;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

/* 返回按钮：与大屏整体一致的深色玻璃拟态 */
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 6px 14px 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.back-arrow {
  font-size: 18px;
  line-height: 1;
  transform: translateY(-1px);
}

.dashboard-header h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 2px;
  color: #fff;
}

.update-time {
  color: #8c8c8c;
  font-size: 14px;
}

.stat-cards {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}

.card {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
}

.card-label {
  font-size: 16px;
  color: #bfbfbf;
  margin-bottom: 12px;
}

.card-value {
  font-size: 42px;
  font-weight: bold;
  color: #36cfc9;
}

.card-unit {
  font-size: 20px;
  margin-left: 4px;
  color: #8c8c8c;
}

.card-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #8c8c8c;
}

.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.chart-box {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
}

.chart {
  width: 100%;
  height: 320px;
}

.full-width {
  grid-column: span 2;
}

/* Tab 切换 */
.tab-nav {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.tab-btn {
  padding: 8px 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #bfbfbf;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.tab-btn.active {
  background: #1890ff;
  border-color: #1890ff;
  color: #fff;
}

/* 日志审计 */
.audit-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #fff;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.audit-table th,
.audit-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.audit-table th {
  color: #8c8c8c;
  font-weight: normal;
}

.audit-table .danger {
  color: #ff4d4f;
  font-weight: bold;
}

.empty-tip {
  color: #8c8c8c;
  text-align: center;
  padding: 24px 0;
}

/* Trace 查询 */
.trace-query {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.trace-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.trace-input::placeholder {
  color: #8c8c8c;
}

.trace-btn {
  padding: 8px 20px;
  background: #1890ff;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.trace-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.trace-result {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
}

.trace-summary {
  color: #bfbfbf;
  font-size: 14px;
  margin-bottom: 12px;
}

.trace-summary b {
  color: #36cfc9;
}

.trace-timeline {
  max-height: 320px;
  overflow-y: auto;
}

.trace-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
}

.trace-time {
  color: #8c8c8c;
  white-space: nowrap;
  font-family: monospace;
}

.trace-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.type-operation .trace-tag {
  background: rgba(24, 144, 255, 0.2);
  color: #40a9ff;
}

.type-error .trace-tag {
  background: rgba(255, 77, 79, 0.2);
  color: #ff7875;
}

.type-login .trace-tag {
  background: rgba(82, 196, 26, 0.2);
  color: #73d13d;
}

.trace-detail {
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 用户画像 */
.profile-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.user-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.profile-hint {
  color: #8c8c8c;
  font-size: 13px;
}

.user-chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #bfbfbf;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.user-chip em {
  font-style: normal;
  margin-left: 6px;
  color: #36cfc9;
}

.user-chip.active {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.18);
  color: #fff;
}

.profile-cards {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}

.profile-cards .card {
  padding: 18px 12px;
}

.profile-cards .card-label {
  font-size: 14px;
  margin-bottom: 8px;
}

.profile-cards .card-value {
  font-size: 32px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-chip {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(79, 195, 247, 0.14);
  border: 1px solid rgba(79, 195, 247, 0.35);
  color: #9fdcff;
  font-size: 13px;
}

.tag-chip b {
  margin-left: 6px;
  color: #4fc3f7;
}

.tag-subtitle {
  margin-top: 20px;
}

/* 移动端适配：窄屏下单列布局，卡片两列排布 */
@media (max-width: 768px) {
  .dashboard {
    padding: 12px 10px 20px;
  }

  .dashboard-header {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    margin-bottom: 14px;
  }

  .header-left {
    gap: 8px;
  }

  .dashboard-header h1 {
    font-size: 15px;
    letter-spacing: 0;
    line-height: 1.3;
  }

  .back-btn {
    flex-shrink: 0;
    padding: 5px 11px 5px 8px;
    font-size: 13px;
  }

  .update-time {
    font-size: 12px;
    padding-left: 2px;
  }

  .stat-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }

  .profile-toolbar {
    flex-direction: column;
    gap: 10px;
  }

  .profile-cards {
    grid-template-columns: 1fr 1fr;
  }

  .card {
    padding: 14px 8px;
    border-radius: 10px;
  }

  .card-label {
    font-size: 13px;
    margin-bottom: 8px;
  }

  .card-value {
    font-size: 26px;
  }

  .charts {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .full-width {
    grid-column: span 1;
  }

  .chart {
    height: 240px;
  }

  .tab-nav {
    gap: 8px;
    margin-bottom: 14px;
  }

  .tab-btn {
    flex: 1;
    padding: 8px 0;
    text-align: center;
    font-size: 14px;
  }

  /* 审计表格窄屏下横向滚动，避免列被挤碎 */
  .chart-box {
    overflow-x: auto;
  }

  .audit-table {
    min-width: 460px;
    font-size: 12px;
  }

  .audit-table th,
  .audit-table td {
    padding: 8px 6px;
  }

  .trace-query {
    flex-wrap: nowrap;
  }
}
</style>

<style>
/* 大屏页面需要铺满浏览器宽度，覆盖全局 #app 的 1126px 固定宽度限制 */
#app:has(.dashboard) {
  width: 100%;
  max-width: 100%;
  margin: 0;
  border-inline: none;
  text-align: left;
}
</style>
