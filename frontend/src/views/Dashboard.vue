<script setup lang="ts">
/**
 * @file 数据运营大屏
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
});

/**
 * 初始化三个图表实例
 */
function initCharts() {
  sentimentChart.value = echarts.init(document.getElementById('sentiment-chart')!);
  hotChart.value = echarts.init(document.getElementById('hot-chart')!);
  trendChart.value = echarts.init(document.getElementById('trend-chart')!);
}

/**
 * 更新大屏数据
 */
function updateDashboard(stats: AnalyticsStats) {
  totalVisits.value = stats.totalVisits;
  todayVisits.value = stats.todayVisits;
  updatedAt.value = stats.updatedAt;

  updateSentimentChart(stats.sentimentDist);
  updateHotChart(stats.hotQuestions);
  updateTrendChart(stats.hourlyTrend);
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
}
</script>

<template>
  <div class="dashboard">
    <!-- 顶部标题栏 -->
    <header class="dashboard-header">
      <h1>景区导览 AI 数字人 · 数据运营大屏</h1>
      <span class="update-time">更新时间：{{ updatedAt }}</span>
    </header>

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
    </section>

    <!-- 图表区 -->
    <section class="charts">
      <div class="chart-box">
        <div id="sentiment-chart" class="chart"></div>
      </div>
      <div class="chart-box">
        <div id="hot-chart" class="chart"></div>
      </div>
      <div class="chart-box full-width">
        <div id="trend-chart" class="chart"></div>
      </div>
    </section>
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
