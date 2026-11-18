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
const activeTab = ref<'stats' | 'audit'>('stats');

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
    title: { text: '热门景点 TOP10', left: 'center', textStyle: { color: '#303A35', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { color: '#A5AAA5', interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: '#A5AAA5' } },
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
      { text: '失物招领状态分布', left: '25%', top: '5%', textStyle: { color: '#303A35', fontSize: 14 } },
      { text: '丢失 vs 捡到', left: '75%', top: '5%', textStyle: { color: '#303A35', fontSize: 14 } }
    ],
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['30%', '55%'],
        center: ['25%', '60%'],
        label: { color: '#303A35' },
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
        label: { color: '#303A35' },
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
    title: { text: '失物招领热门分类 TOP5', left: 'center', textStyle: { color: '#303A35', fontSize: 16 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '6%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#A5AAA5' } },
    yAxis: { type: 'category', data: names, axisLabel: { color: '#A5AAA5' } },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#b37feb' },
      barWidth: '50%',
      label: { show: true, position: 'right', color: '#303A35' }
    }]
  });
}

/**
 * 情感分布饼图
 */
function updateSentimentChart(dist: AnalyticsStats['sentimentDist']) {
  sentimentChart.value?.setOption({
    title: { text: '用户情感分布', left: 'center', textStyle: { color: '#303A35', fontSize: 16 } },
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#A5AAA5' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      label: { color: '#303A35' },
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
    title: { text: '热门问答 TOP10', left: 'center', textStyle: { color: '#303A35', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { color: '#A5AAA5', interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: '#A5AAA5' } },
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
    title: { text: '近 24 小时问答量趋势', left: 'center', textStyle: { color: '#303A35', fontSize: 16 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: hours, axisLabel: { color: '#A5AAA5' } },
    yAxis: { type: 'value', axisLabel: { color: '#A5AAA5' } },
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
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100%;
  background: #F7F6F2;
  padding: 0;
  color: #303A35;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
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

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 5px 14px;
  background: #FFFFFF;
  border: 1px solid #E8E8E2;
  border-radius: 6px;
  color: #526F61;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  height: 32px;
}
.back-btn:hover { background: #E9EFEA; }
.back-arrow { font-size: 16px; line-height: 1; }

.dashboard-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303A35;
}

.update-time { color: #7B827D; font-size: 13px; }

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.card {
  background: #FFFFFF;
  border: 1px solid #E8E8E2;
  border-radius: 8px;
  padding: 20px 20px;
}

.card-label { font-size: 13px; color: #7B827D; margin-bottom: 10px; }
.card-value { font-size: 30px; font-weight: 600; color: #526F61; font-variant-numeric: tabular-nums; }
.card-unit { font-size: 14px; color: #7B827D; margin: 0 2px; }
.card-sub { margin-top: 4px; font-size: 12px; color: #A5AAA5; }

.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-box {
  background: #FFFFFF;
  border: 1px solid #E8E8E2;
  border-radius: 8px;
  padding: 20px;
}

.chart { width: 100%; height: 320px; }
.full-width { grid-column: span 2; }

.tab-nav {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border-bottom: 1px solid #E8E8E2;
}

.tab-btn {
  padding: 10px 22px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #7B827D;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.tab-btn:hover { color: #303A35; }
.tab-btn.active {
  color: #526F61;
  border-bottom-color: #526F61;
  font-weight: 500;
}

.audit-title { margin: 0 0 14px 0; font-size: 16px; font-weight: 600; color: #303A35; }

.audit-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.audit-table th, .audit-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid #EEEEE8;
  color: #303A35;
}
.audit-table th { color: #A5AAA5; font-weight: 500; font-size: 13px; }
.audit-table .danger { color: #C45F55; font-weight: 600; }
.empty-tip { color: #A5AAA5; text-align: center; padding: 28px 0; font-size: 14px; }

.trace-query { display: flex; gap: 10px; margin-bottom: 16px; }

.trace-input {
  flex: 1;
  padding: 8px 12px;
  background: #FFFFFF;
  border: 1px solid #E8E8E2;
  border-radius: 6px;
  color: #303A35;
  font-size: 14px;
  height: 36px;
  font-family: inherit;
}
.trace-input::placeholder { color: #A5AAA5; }

.trace-btn {
  padding: 0 20px;
  background: #526F61;
  border: none;
  border-radius: 6px;
  color: #FFFFFF;
  cursor: pointer;
  font-size: 14px;
  height: 36px;
  transition: background 0.15s;
  font-family: inherit;
}
.trace-btn:hover { background: #425C50; }
.trace-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.trace-result { border-top: 1px solid #E8E8E2; padding-top: 14px; }
.trace-summary { color: #7B827D; font-size: 14px; margin-bottom: 14px; }
.trace-summary b { color: #526F61; font-weight: 600; }

.trace-timeline { max-height: 320px; overflow-y: auto; }
.trace-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #F5F5F1;
  font-size: 14px;
}
.trace-time { color: #A5AAA5; white-space: nowrap; font-family: monospace; font-size: 12px; }
.trace-tag { padding: 2px 10px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
.type-operation .trace-tag { background: #DCE5DD; color: #526F61; }
.type-error .trace-tag { background: #F2DFDF; color: #C45F55; }
.type-login .trace-tag { background: #DDE7DF; color: #4E8A68; }
.trace-detail { color: #303A35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 768px) {
  .dashboard { padding: 0; }
  .dashboard-header { flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 14px; }
  .header-left { gap: 8px; }
  .dashboard-header h1 { font-size: 15px; }
  .stat-cards { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
  .card { padding: 14px; }
  .card-value { font-size: 24px; }
  .charts { grid-template-columns: 1fr; gap: 10px; }
  .full-width { grid-column: span 1; }
  .chart { height: 240px; }
  .tab-nav { gap: 0; margin-bottom: 14px; }
  .tab-btn { flex: 1; padding: 8px 0; font-size: 13px; text-align: center; }
  .chart-box { overflow-x: auto; padding: 14px; }
  .audit-table { min-width: 400px; font-size: 13px; }
  .audit-table th, .audit-table td { padding: 8px 10px; }
}
</style>

<style>
#app:has(.dashboard) {
  width: 100%;
  max-width: 100%;
  margin: 0;
  border-inline: none;
  text-align: left;
}
</style>

