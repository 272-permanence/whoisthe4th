<script setup lang="ts">
/**
 * @file 数据运营大屏（浅色青绿主题）
 * @author 第八组
 * @date 2026-10-15
 * @description 实时展示服务人次、热门问答、情感分布、问答趋势
 */
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import * as echarts from 'echarts';
import { getStats, connectStatsStream, type AnalyticsStats } from '../api/analytics';

const totalVisits = ref(0);
const todayVisits = ref(0);
const updatedAt = ref('');

const sentimentChart = shallowRef<echarts.ECharts | null>(null);
const hotChart = shallowRef<echarts.ECharts | null>(null);
const trendChart = shallowRef<echarts.ECharts | null>(null);

let closeStream: (() => void) | null = null;

onMounted(async () => {
  initCharts();
  const stats = await getStats();
  updateDashboard(stats);
  closeStream = connectStatsStream(updateDashboard);
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  closeStream?.();
  window.removeEventListener('resize', resizeCharts);
  sentimentChart.value?.dispose();
  hotChart.value?.dispose();
  trendChart.value?.dispose();
});

function initCharts() {
  sentimentChart.value = echarts.init(document.getElementById('sentiment-chart')!);
  hotChart.value = echarts.init(document.getElementById('hot-chart')!);
  trendChart.value = echarts.init(document.getElementById('trend-chart')!);
}

function updateDashboard(stats: AnalyticsStats) {
  totalVisits.value = stats.totalVisits;
  todayVisits.value = stats.todayVisits;
  updatedAt.value = stats.updatedAt;

  updateSentimentChart(stats.sentimentDist);
  updateHotChart(stats.hotQuestions);
  updateTrendChart(stats.hourlyTrend);
}

function updateSentimentChart(dist: AnalyticsStats['sentimentDist']) {
  sentimentChart.value?.setOption({
    title: { text: '用户情感分布', left: 'center', textStyle: { color: '#1f2937', fontSize: 16, fontWeight: 600 } },
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      label: { color: '#374151' },
      data: [
        { value: dist.positive, name: '正面', itemStyle: { color: '#10b981' } },
        { value: dist.neutral, name: '中性', itemStyle: { color: '#0f766e' } },
        { value: dist.negative, name: '负面', itemStyle: { color: '#ef4444' } }
      ]
    }]
  });
}

function updateHotChart(questions: AnalyticsStats['hotQuestions']) {
  const names = questions.map(q => q.message.length > 12 ? q.message.slice(0, 12) + '...' : q.message);
  const counts = questions.map(q => q.count);

  hotChart.value?.setOption({
    title: { text: '热门问答 TOP10', left: 'center', textStyle: { color: '#1f2937', fontSize: 16, fontWeight: 600 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { color: '#6b7280', interval: 0, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { color: '#6b7280' } },
    series: [{
      type: 'bar',
      data: counts,
      itemStyle: { color: '#0f766e', borderRadius: [4, 4, 0, 0] },
      barWidth: '50%'
    }]
  });
}

function updateTrendChart(trend: AnalyticsStats['hourlyTrend']) {
  const hours = trend.map(t => t.hour);
  const counts = trend.map(t => t.count);

  trendChart.value?.setOption({
    title: { text: '近 24 小时问答量趋势', left: 'center', textStyle: { color: '#1f2937', fontSize: 16, fontWeight: 600 } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: hours, axisLabel: { color: '#6b7280' } },
    yAxis: { type: 'value', axisLabel: { color: '#6b7280' } },
    series: [{
      type: 'line',
      data: counts,
      smooth: true,
      areaStyle: { color: 'rgba(15, 118, 110, 0.12)' },
      lineStyle: { color: '#0f766e', width: 2.5 },
      itemStyle: { color: '#0f766e' }
    }]
  });
}

function resizeCharts() {
  sentimentChart.value?.resize();
  hotChart.value?.resize();
  trendChart.value?.resize();
}
</script>

<template>
  <div class="dashboard">
    <!-- 顶部标题栏 -->
    <header class="dashboard-header">
      <div>
        <h1>数据运营大屏</h1>
        <p class="dashboard-sub">景区导览 AI · 实时数据监控</p>
      </div>
      <span class="update-time">更新时间：{{ updatedAt }}</span>
    </header>

    <!-- 核心指标卡片 -->
    <section class="stat-cards">
      <div class="stat-card">
        <div class="card-label">累计服务人次</div>
        <div class="card-value nums">{{ totalVisits.toLocaleString() }}</div>
      </div>
      <div class="stat-card">
        <div class="card-label">今日服务人次</div>
        <div class="card-value nums">{{ todayVisits.toLocaleString() }}</div>
      </div>
    </section>

    <!-- 图表区 -->
    <section class="charts">
      <div class="chart-card">
        <div id="sentiment-chart" class="chart"></div>
      </div>
      <div class="chart-card">
        <div id="hot-chart" class="chart"></div>
      </div>
      <div class="chart-card full-width">
        <div id="trend-chart" class="chart"></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: var(--color-bg);
  padding: var(--space-8) var(--space-6);
  font-family: var(--font-sans);
  color: var(--color-text);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-6);
}

.dashboard-header h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.04em;
}

.dashboard-sub {
  margin: 4px 0 0;
  font-size: var(--text-body);
  color: var(--color-text-2);
}

.update-time {
  color: var(--color-text-3);
  font-size: var(--text-caption);
  font-variant-numeric: tabular-nums;
}

.stat-cards {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.stat-card {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5) var(--space-6);
  box-shadow: var(--shadow-sm);
}

.card-label {
  font-size: var(--text-caption);
  color: var(--color-text-2);
  margin-bottom: var(--space-2);
}

.card-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.chart-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.chart-card.full-width {
  grid-column: 1 / -1;
}

.chart {
  width: 100%;
  height: 300px;
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }
  .stat-cards {
    flex-direction: column;
  }
  .charts {
    grid-template-columns: 1fr;
  }
  .dashboard { padding: var(--space-6) var(--space-4); }
  .dashboard-header h1 { font-size: 22px; }
}
</style>
