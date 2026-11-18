<script setup lang="ts">
/**
 * @file 日志中心（管理员）
 * @description 覆盖日志分享的全部能力：概览、操作/错误/登录日志查询、审计、
 *              行为分析（热门景点 / 活跃时段 / 行为路径）、相关景点推荐、全链路追踪。
 *              所有数据均来自后端真实接口，无任何 mock。
 */
import { ref, onMounted, onBeforeUnmount, shallowRef, nextTick } from 'vue';
import * as echarts from 'echarts';
import { apiFetch } from '../../common/apiClient';

const LOGS = '/api/v1/logs';
const ANALYTICS = '/api/v1/analytics';

type TabKey = 'overview' | 'operation' | 'error' | 'login' | 'audit' | 'behavior' | 'recommend' | 'trace';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'operation', label: '操作日志' },
  { key: 'error', label: '错误日志' },
  { key: 'login', label: '登录日志' },
  { key: 'audit', label: '审计' },
  { key: 'behavior', label: '行为分析' },
  { key: 'recommend', label: '相关推荐' },
  { key: 'trace', label: '全链路追踪' },
];

const activeTab = ref<TabKey>('overview');
const loading = ref(false);
const errMsg = ref('');

/* ============================ 数据类型 ============================ */

interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface OperationLog {
  id: number;
  trace_id: string;
  user_id: number | null;
  api_path: string;
  http_method: string;
  request_params: unknown;
  response_code: number;
  duration_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

interface ErrorLog {
  id: number;
  trace_id: string;
  error_type: string;
  error_code: string | null;
  stack: string | null;
  route: string | null;
  service: string | null;
  user_id: number | null;
  created_at: string;
}

interface LoginLog {
  id: number;
  trace_id: string;
  username: string | null;
  ip: string | null;
  login_result: string;
  fail_reason: string | null;
  created_at: string;
}

interface AbnormalLogin {
  ip: string;
  failCount: number;
  firstFail: string;
  lastFail: string;
}

interface HotPoi {
  poiId: number;
  name: string;
  visitCount: number;
}

interface ActiveHour {
  hour: number;
  count: number;
}

interface PathRow {
  traceId: string;
  stepCount: number;
  startedAt: string;
  endedAt: string;
  path: string;
}

interface RelatedPoi {
  poiId: number;
  name: string;
  coVisitCount: number;
}

interface TimelineItem {
  log_type: 'operation' | 'error' | 'login';
  created_at: string;
  [key: string]: unknown;
}

interface TraceResult {
  traceId: string;
  operationCount: number;
  errorCount: number;
  loginCount: number;
  timeline: TimelineItem[];
}

/* ============================ 工具函数 ============================ */

function todayStart(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`;
}

/** datetime-local 的 "2026-11-17T10:30" → "2026-11-17 10:30:00" */
function toSqlTime(v: string): string | undefined {
  if (!v) return undefined;
  return v.length === 16 ? `${v.replace('T', ' ')}:00` : v.replace('T', ' ');
}

function fmt(t: unknown): string {
  if (!t) return '-';
  const d = new Date(String(t).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 18)}…` : id;
}

function methodClass(m: string): string {
  return `m-${m.toLowerCase()}`;
}

function codeClass(code: number): string {
  if (code >= 500) return 'c-err';
  if (code >= 400) return 'c-warn';
  return 'c-ok';
}

async function run<T>(fn: () => Promise<T>): Promise<T | null> {
  loading.value = true;
  errMsg.value = '';
  try {
    return await fn();
  } catch (e) {
    errMsg.value = e instanceof Error ? e.message : String(e);
    return null;
  } finally {
    loading.value = false;
  }
}

/* ============================ 概览 ============================ */

const overview = ref({
  operationTotal: 0,
  operationToday: 0,
  errorTotal: 0,
  loginFail: 0,
  abnormalIp: 0,
  topPoi: '' as string,
});

async function loadOverview() {
  const today = todayStart();
  const [op, opToday, err, loginAll, loginOk, abnormal, hot] = await Promise.all([
    apiFetch<PageResult<OperationLog>>('/operation?page=1&pageSize=1', { apiPrefix: LOGS }),
    apiFetch<PageResult<OperationLog>>(`/operation?page=1&pageSize=1&start=${encodeURIComponent(today)}`, { apiPrefix: LOGS }),
    apiFetch<PageResult<ErrorLog>>('/error?page=1&pageSize=1', { apiPrefix: LOGS }),
    apiFetch<PageResult<LoginLog>>('/login?page=1&pageSize=1', { apiPrefix: LOGS }),
    apiFetch<PageResult<LoginLog>>('/login?page=1&pageSize=1&loginResult=success', { apiPrefix: LOGS }),
    apiFetch<AbnormalLogin[]>('/audit/login-abnormal', { apiPrefix: ANALYTICS }).catch(() => [] as AbnormalLogin[]),
    apiFetch<HotPoi[]>('/behaviors/hot-pois', { apiPrefix: ANALYTICS }).catch(() => [] as HotPoi[]),
  ]);
  overview.value = {
    operationTotal: op.total,
    operationToday: opToday.total,
    errorTotal: err.total,
    loginFail: Math.max(0, loginAll.total - loginOk.total),
    abnormalIp: abnormal?.length ?? 0,
    topPoi: hot?.[0] ? `${hot[0].name}（${hot[0].visitCount} 次）` : '暂无',
  };
}

/* ============================ 操作日志 ============================ */

const opFilter = ref({ traceId: '', apiPath: '', method: '', start: '', end: '' });
const opPage = ref(1);
const opPageSize = 20;
const opData = ref<PageResult<OperationLog>>({ list: [], total: 0, page: 1, pageSize: opPageSize });

function opQuery(): string {
  const f = opFilter.value;
  const q = new URLSearchParams({ page: String(opPage.value), pageSize: String(opPageSize) });
  if (f.traceId) q.set('traceId', f.traceId);
  if (f.apiPath) q.set('apiPath', f.apiPath);
  if (f.method) q.set('method', f.method);
  const s = toSqlTime(f.start);
  const e = toSqlTime(f.end);
  if (s) q.set('start', s);
  if (e) q.set('end', e);
  return q.toString();
}

async function loadOperation() {
  const d = await run(() => apiFetch<PageResult<OperationLog>>(`/operation?${opQuery()}`, { apiPrefix: LOGS }));
  if (d) opData.value = d;
}

function searchOperation() {
  opPage.value = 1;
  void loadOperation();
}

/* ============================ 错误日志 ============================ */

const errFilter = ref({ traceId: '', errorType: '', start: '', end: '' });
const errPage = ref(1);
const errPageSize = 20;
const errData = ref<PageResult<ErrorLog>>({ list: [], total: 0, page: 1, pageSize: errPageSize });

function errQuery(): string {
  const f = errFilter.value;
  const q = new URLSearchParams({ page: String(errPage.value), pageSize: String(errPageSize) });
  if (f.traceId) q.set('traceId', f.traceId);
  if (f.errorType) q.set('errorType', f.errorType);
  const s = toSqlTime(f.start);
  const e = toSqlTime(f.end);
  if (s) q.set('start', s);
  if (e) q.set('end', e);
  return q.toString();
}

async function loadError() {
  const d = await run(() => apiFetch<PageResult<ErrorLog>>(`/error?${errQuery()}`, { apiPrefix: LOGS }));
  if (d) errData.value = d;
}

function searchError() {
  errPage.value = 1;
  void loadError();
}

/* ============================ 登录日志 ============================ */

const loginFilter = ref({ username: '', loginResult: '', start: '', end: '' });
const loginPage = ref(1);
const loginPageSize = 20;
const loginData = ref<PageResult<LoginLog>>({ list: [], total: 0, page: 1, pageSize: loginPageSize });

function loginQuery(): string {
  const f = loginFilter.value;
  const q = new URLSearchParams({ page: String(loginPage.value), pageSize: String(loginPageSize) });
  if (f.username) q.set('username', f.username);
  if (f.loginResult) q.set('loginResult', f.loginResult);
  const s = toSqlTime(f.start);
  const e = toSqlTime(f.end);
  if (s) q.set('start', s);
  if (e) q.set('end', e);
  return q.toString();
}

async function loadLogin() {
  const d = await run(() => apiFetch<PageResult<LoginLog>>(`/login?${loginQuery()}`, { apiPrefix: LOGS }));
  if (d) loginData.value = d;
}

function searchLogin() {
  loginPage.value = 1;
  void loadLogin();
}

/* ============================ 审计 ============================ */

const abnormalLogins = ref<AbnormalLogin[]>([]);
const sensitiveOps = ref<OperationLog[]>([]);

async function loadAudit() {
  const [a, s] = await Promise.all([
    run(() => apiFetch<AbnormalLogin[]>('/audit/login-abnormal', { apiPrefix: ANALYTICS })),
    run(() => apiFetch<OperationLog[]>('/audit/sensitive-ops?limit=50', { apiPrefix: ANALYTICS })),
  ]);
  abnormalLogins.value = a ?? [];
  sensitiveOps.value = s ?? [];
}

/* ============================ 行为分析 ============================ */

const hotPois = ref<HotPoi[]>([]);
const activeHours = ref<ActiveHour[]>([]);
const paths = ref<PathRow[]>([]);
const pathDetail = ref<{ traceId: string; steps: OperationLog[] } | null>(null);

const hotChartEl = ref<HTMLDivElement | null>(null);
const hourChartEl = ref<HTMLDivElement | null>(null);
const hotChart = shallowRef<echarts.ECharts | null>(null);
const hourChart = shallowRef<echarts.ECharts | null>(null);

function renderHotChart() {
  if (!hotChartEl.value) return;
  if (!hotChart.value || hotChart.value.getDom() !== hotChartEl.value) {
    hotChart.value?.dispose();
    hotChart.value = echarts.init(hotChartEl.value);
  }
  hotChart.value.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 90, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '访问次数' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: hotPois.value.map((p) => p.name),
      axisLabel: { width: 80, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      data: hotPois.value.map((p) => p.visitCount),
      itemStyle: { color: '#526F61', borderRadius: [0, 4, 4, 0] },
      barMaxWidth: 22,
      label: { show: true, position: 'right' },
    }],
  }, true);
}

function renderHourChart() {
  if (!hourChartEl.value) return;
  if (!hourChart.value || hourChart.value.getDom() !== hourChartEl.value) {
    hourChart.value?.dispose();
    hourChart.value = echarts.init(hourChartEl.value);
  }
  hourChart.value.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 30, top: 30, bottom: 40 },
    xAxis: {
      type: 'category',
      data: activeHours.value.map((h) => `${h.hour}时`),
      axisLabel: { interval: 1 },
    },
    yAxis: { type: 'value', name: '请求数' },
    series: [{
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: activeHours.value.map((h) => h.count),
      lineStyle: { color: '#c98a3c', width: 2 },
      itemStyle: { color: '#c98a3c' },
      areaStyle: { opacity: 0.12, color: '#c98a3c' },
    }],
  }, true);
}

async function loadBehavior() {
  const [h, a, p] = await Promise.all([
    run(() => apiFetch<HotPoi[]>('/behaviors/hot-pois', { apiPrefix: ANALYTICS })),
    run(() => apiFetch<ActiveHour[]>('/behaviors/active-hours', { apiPrefix: ANALYTICS })),
    run(() => apiFetch<PathRow[]>('/behaviors/path?limit=20', { apiPrefix: ANALYTICS })),
  ]);
  hotPois.value = h ?? [];
  activeHours.value = a ?? [];
  paths.value = p ?? [];
  await nextTick();
  renderHotChart();
  renderHourChart();
}

async function loadPathDetail(traceId: string) {
  pathDetail.value = null;
  const d = await run(() =>
    apiFetch<{ traceId: string; steps: OperationLog[] }>(
      `/behaviors/path?traceId=${encodeURIComponent(traceId)}`,
      { apiPrefix: ANALYTICS }
    )
  );
  if (d) pathDetail.value = d;
}

function resizeCharts() {
  hotChart.value?.resize();
  hourChart.value?.resize();
}

/* ============================ 相关推荐 ============================ */

const poiId = ref('2');
const related = ref<RelatedPoi[]>([]);
const relatedSource = ref<number | null>(null);

async function loadRelated() {
  const id = Number(poiId.value);
  if (!Number.isFinite(id) || id <= 0) {
    errMsg.value = '请输入合法的景点 ID';
    return;
  }
  const d = await run(() =>
    apiFetch<{ sourcePoiId: number; related: RelatedPoi[] }>(
      `/recommend/related-pois?poiId=${id}`,
      { apiPrefix: ANALYTICS }
    )
  );
  if (d) {
    relatedSource.value = d.sourcePoiId;
    related.value = d.related;
  }
}

/* ============================ 全链路追踪 ============================ */

const traceInput = ref('');
const traceResult = ref<TraceResult | null>(null);

async function loadTrace() {
  const id = traceInput.value.trim();
  if (!id) {
    errMsg.value = '请输入 traceId';
    return;
  }
  traceResult.value = null;
  const d = await run(() =>
    apiFetch<TraceResult>(`/trace/${encodeURIComponent(id)}`, { apiPrefix: LOGS })
  );
  if (d) traceResult.value = d;
}

/** 从任意一行日志里点 traceId 跳去全链路 */
function jumpTrace(id: string) {
  activeTab.value = 'trace';
  traceInput.value = id;
  void nextTick(() => void loadTrace());
}

/* ============================ Tab 切换 ============================ */

async function switchTab(key: TabKey) {
  activeTab.value = key;
  errMsg.value = '';
  await nextTick();
  if (key === 'overview') await run(loadOverview);
  else if (key === 'operation') await loadOperation();
  else if (key === 'error') await loadError();
  else if (key === 'login') await loadLogin();
  else if (key === 'audit') await loadAudit();
  else if (key === 'behavior') await loadBehavior();
  else if (key === 'recommend') await loadRelated();
  else if (key === 'trace' && traceResult.value === null && traceInput.value) await loadTrace();
}

onMounted(async () => {
  await run(loadOverview);
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts);
  hotChart.value?.dispose();
  hourChart.value?.dispose();
});
</script>

<template>
  <div class="log-center">
    <header class="page-head">
      <div>
        <h2>日志中心</h2>
        <p class="sub">错误日志 · 操作日志 · 登录日志 · 审计 · 行为分析 · 推荐 · 全链路追踪</p>
      </div>
      <button class="btn" :disabled="loading" @click="switchTab(activeTab)">
        {{ loading ? '加载中…' : '刷新' }}
      </button>
    </header>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</button>
    </nav>

    <p v-if="errMsg" class="err">{{ errMsg }}</p>

    <!-- ==================== 概览 ==================== -->
    <template v-if="activeTab === 'overview'">
      <section class="cards">
        <div class="card"><span class="card-label">操作日志总数</span><strong>{{ overview.operationTotal }}</strong></div>
        <div class="card"><span class="card-label">今日操作数</span><strong>{{ overview.operationToday }}</strong></div>
        <div class="card"><span class="card-label">错误日志总数</span><strong>{{ overview.errorTotal }}</strong></div>
        <div class="card"><span class="card-label">登录失败次数</span><strong>{{ overview.loginFail }}</strong></div>
        <div class="card"><span class="card-label">异常登录 IP</span><strong>{{ overview.abnormalIp }}</strong></div>
        <div class="card"><span class="card-label">热门景点</span><strong class="small">{{ overview.topPoi }}</strong></div>
      </section>
      <section class="panel">
        <h3>这套日志做了什么</h3>
        <ol class="flow">
          <li><b>采集</b>：全局中间件自动记录每个 API 请求；前端埋点记录点击与 JS 错误；登录接口记录成功/失败。</li>
          <li><b>存储</b>：error_log / operation_log / login_log 三张表，统一 trace_id；Redis Stream 异步落库，降级直写 MySQL。</li>
          <li><b>查询</b>：三类日志分页检索 + 按 traceId 串联全链路。</li>
          <li><b>应用</b>：审计（暴力破解、敏感操作）、行为分析（热门景点、活跃时段、路径）、推荐（看过 A 的人还看 B）。</li>
        </ol>
      </section>
    </template>

    <!-- ==================== 操作日志 ==================== -->
    <template v-if="activeTab === 'operation'">
      <section class="filters">
        <input v-model="opFilter.traceId" placeholder="traceId" />
        <input v-model="opFilter.apiPath" placeholder="接口路径，如 /poi" />
        <select v-model="opFilter.method">
          <option value="">全部方法</option>
          <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>CLICK</option>
        </select>
        <input v-model="opFilter.start" type="datetime-local" title="开始时间" />
        <input v-model="opFilter.end" type="datetime-local" title="结束时间" />
        <button class="btn" @click="searchOperation">查询</button>
      </section>

      <section class="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th><th>方法</th><th>接口/页面</th><th>状态码</th><th>耗时</th><th>用户</th><th>IP</th><th>traceId</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in opData.list" :key="row.id">
              <td class="nowrap">{{ fmt(row.created_at) }}</td>
              <td><span class="method" :class="methodClass(row.http_method)">{{ row.http_method }}</span></td>
              <td class="path">{{ row.api_path }}</td>
              <td><span :class="codeClass(row.response_code)">{{ row.response_code }}</span></td>
              <td>{{ row.duration_ms != null ? row.duration_ms + 'ms' : '-' }}</td>
              <td>{{ row.user_id ?? '-' }}</td>
              <td>{{ row.ip ?? '-' }}</td>
              <td><a class="trace" :title="row.trace_id" @click="jumpTrace(row.trace_id)">{{ shortId(row.trace_id) }}</a></td>
            </tr>
            <tr v-if="opData.list.length === 0"><td colspan="8" class="empty">暂无操作日志</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <span>共 {{ opData.total }} 条</span>
          <button class="btn-sm" :disabled="opPage <= 1" @click="opPage--; loadOperation()">上一页</button>
          <span>第 {{ opPage }} 页</span>
          <button class="btn-sm" :disabled="opPage * opPageSize >= opData.total" @click="opPage++; loadOperation()">下一页</button>
        </div>
      </section>
    </template>

    <!-- ==================== 错误日志 ==================== -->
    <template v-if="activeTab === 'error'">
      <section class="filters">
        <input v-model="errFilter.traceId" placeholder="traceId" />
        <select v-model="errFilter.errorType">
          <option value="">全部类型</option>
          <option value="business">business（业务）</option>
          <option value="system">system（系统）</option>
          <option value="dependency">dependency（依赖）</option>
        </select>
        <input v-model="errFilter.start" type="datetime-local" title="开始时间" />
        <input v-model="errFilter.end" type="datetime-local" title="结束时间" />
        <button class="btn" @click="searchError">查询</button>
      </section>

      <section class="panel table-wrap">
        <table>
          <thead>
            <tr><th>时间</th><th>类型</th><th>错误码</th><th>路由</th><th>服务</th><th>traceId</th><th>堆栈</th></tr>
          </thead>
          <tbody>
            <template v-for="row in errData.list" :key="row.id">
              <tr>
                <td class="nowrap">{{ fmt(row.created_at) }}</td>
                <td><span class="badge">{{ row.error_type }}</span></td>
                <td>{{ row.error_code ?? '-' }}</td>
                <td class="path">{{ row.route ?? '-' }}</td>
                <td>{{ row.service ?? '-' }}</td>
                <td><a class="trace" :title="row.trace_id" @click="jumpTrace(row.trace_id)">{{ shortId(row.trace_id) }}</a></td>
                <td>
                  <details v-if="row.stack">
                    <summary>展开</summary>
                    <pre class="stack">{{ row.stack }}</pre>
                  </details>
                  <span v-else>-</span>
                </td>
              </tr>
            </template>
            <tr v-if="errData.list.length === 0"><td colspan="7" class="empty">暂无错误日志</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <span>共 {{ errData.total }} 条</span>
          <button class="btn-sm" :disabled="errPage <= 1" @click="errPage--; loadError()">上一页</button>
          <span>第 {{ errPage }} 页</span>
          <button class="btn-sm" :disabled="errPage * errPageSize >= errData.total" @click="errPage++; loadError()">下一页</button>
        </div>
      </section>
    </template>

    <!-- ==================== 登录日志 ==================== -->
    <template v-if="activeTab === 'login'">
      <section class="filters">
        <input v-model="loginFilter.username" placeholder="用户名（已脱敏）" />
        <select v-model="loginFilter.loginResult">
          <option value="">全部结果</option>
          <option value="success">success</option>
          <option value="fail">fail（全部失败）</option>
          <option value="fail_wrong_password">fail_wrong_password</option>
          <option value="fail_user_not_found">fail_user_not_found</option>
        </select>
        <input v-model="loginFilter.start" type="datetime-local" title="开始时间" />
        <input v-model="loginFilter.end" type="datetime-local" title="结束时间" />
        <button class="btn" @click="searchLogin">查询</button>
      </section>

      <section class="panel table-wrap">
        <table>
          <thead>
            <tr><th>时间</th><th>用户名</th><th>IP</th><th>结果</th><th>失败原因</th><th>traceId</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in loginData.list" :key="row.id">
              <td class="nowrap">{{ fmt(row.created_at) }}</td>
              <td>{{ row.username ?? '-' }}</td>
              <td>{{ row.ip ?? '-' }}</td>
              <td>
                <span class="badge" :class="row.login_result === 'success' ? 'ok' : 'warn'">{{ row.login_result }}</span>
              </td>
              <td>{{ row.fail_reason ?? '-' }}</td>
              <td><a class="trace" :title="row.trace_id" @click="jumpTrace(row.trace_id)">{{ shortId(row.trace_id) }}</a></td>
            </tr>
            <tr v-if="loginData.list.length === 0"><td colspan="6" class="empty">暂无登录日志</td></tr>
          </tbody>
        </table>
        <div class="pager">
          <span>共 {{ loginData.total }} 条</span>
          <button class="btn-sm" :disabled="loginPage <= 1" @click="loginPage--; loadLogin()">上一页</button>
          <span>第 {{ loginPage }} 页</span>
          <button class="btn-sm" :disabled="loginPage * loginPageSize >= loginData.total" @click="loginPage++; loadLogin()">下一页</button>
        </div>
      </section>
    </template>

    <!-- ==================== 审计 ==================== -->
    <template v-if="activeTab === 'audit'">
      <section class="panel">
        <h3>异常登录（同 IP 1 小时内 ≥3 次失败）</h3>
        <table>
          <thead><tr><th>IP</th><th>失败次数</th><th>首次失败</th><th>最近失败</th></tr></thead>
          <tbody>
            <tr v-for="row in abnormalLogins" :key="row.ip">
              <td>{{ row.ip }}</td>
              <td><span class="badge warn">{{ row.failCount }}</span></td>
              <td>{{ fmt(row.firstFail) }}</td>
              <td>{{ fmt(row.lastFail) }}</td>
            </tr>
            <tr v-if="abnormalLogins.length === 0"><td colspan="4" class="empty">最近 1 小时无异常登录</td></tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h3>敏感操作（删除/修改景点、修改用户权限）</h3>
        <table>
          <thead><tr><th>时间</th><th>方法</th><th>接口</th><th>用户</th><th>IP</th><th>状态码</th><th>traceId</th></tr></thead>
          <tbody>
            <tr v-for="row in sensitiveOps" :key="row.id">
              <td class="nowrap">{{ fmt(row.created_at) }}</td>
              <td><span class="method" :class="methodClass(row.http_method)">{{ row.http_method }}</span></td>
              <td class="path">{{ row.api_path }}</td>
              <td>{{ row.user_id ?? '-' }}</td>
              <td>{{ row.ip ?? '-' }}</td>
              <td><span :class="codeClass(row.response_code)">{{ row.response_code }}</span></td>
              <td><a class="trace" :title="row.trace_id" @click="jumpTrace(row.trace_id)">{{ shortId(row.trace_id) }}</a></td>
            </tr>
            <tr v-if="sensitiveOps.length === 0"><td colspan="7" class="empty">暂无敏感操作记录</td></tr>
          </tbody>
        </table>
      </section>
    </template>

    <!-- ==================== 行为分析 ==================== -->
    <template v-if="activeTab === 'behavior'">
      <section class="panel">
        <h3>热门景点 Top10（来自操作日志中 /poi/:id 的访问次数）</h3>
        <div ref="hotChartEl" class="chart"></div>
      </section>

      <section class="panel">
        <h3>活跃时段分布（近 7 天，按小时）</h3>
        <div ref="hourChartEl" class="chart"></div>
      </section>

      <section class="panel">
        <h3>用户行为路径（最近 20 条 trace）</h3>
        <table>
          <thead><tr><th>traceId</th><th>步数</th><th>开始</th><th>结束</th><th>路径</th><th></th></tr></thead>
          <tbody>
            <tr v-for="row in paths" :key="row.traceId">
              <td><a class="trace" :title="row.traceId" @click="loadPathDetail(row.traceId)">{{ shortId(row.traceId) }}</a></td>
              <td>{{ row.stepCount }}</td>
              <td class="nowrap">{{ fmt(row.startedAt) }}</td>
              <td class="nowrap">{{ fmt(row.endedAt) }}</td>
              <td class="path">{{ row.path }}</td>
              <td><button class="btn-sm" @click="loadPathDetail(row.traceId)">详情</button></td>
            </tr>
            <tr v-if="paths.length === 0"><td colspan="6" class="empty">暂无行为路径数据</td></tr>
          </tbody>
        </table>

        <div v-if="pathDetail" class="path-detail">
          <h4>trace：{{ pathDetail.traceId }}</h4>
          <ol>
            <li v-for="s in pathDetail.steps" :key="s.id">
              <span class="nowrap">{{ fmt(s.created_at) }}</span>
              <span class="method" :class="methodClass(s.http_method)">{{ s.http_method }}</span>
              <span class="path">{{ s.api_path }}</span>
              <span :class="codeClass(s.response_code)">{{ s.response_code }}</span>
              <span v-if="s.duration_ms != null" class="dim">{{ s.duration_ms }}ms</span>
            </li>
          </ol>
          <button class="btn-sm" @click="pathDetail = null">收起</button>
        </div>
      </section>
    </template>

    <!-- ==================== 相关推荐 ==================== -->
    <template v-if="activeTab === 'recommend'">
      <section class="panel">
        <h3>「看过这个景点的人还看过」</h3>
        <p class="hint">基于操作日志中相同 traceId 下的其他景点访问记录聚合，规则版推荐（非机器学习）。</p>
        <div class="filters">
          <input v-model="poiId" placeholder="景点 ID，如 2（雷峰塔）" />
          <button class="btn" @click="loadRelated">查询</button>
        </div>

        <div v-if="relatedSource != null" class="related-head">
          景点 #{{ relatedSource }} 的相关推荐：
        </div>
        <table v-if="related.length > 0">
          <thead><tr><th>排名</th><th>景点</th><th>共同访问次数</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in related" :key="r.poiId">
              <td>{{ i + 1 }}</td>
              <td>{{ r.name }}（#{{ r.poiId }}）</td>
              <td><span class="badge ok">{{ r.coVisitCount }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="relatedSource != null" class="empty">该景点暂无共现记录</p>
      </section>
    </template>

    <!-- ==================== 全链路追踪 ==================== -->
    <template v-if="activeTab === 'trace'">
      <section class="panel">
        <h3>按 traceId 串联操作 + 错误 + 登录日志</h3>
        <div class="filters">
          <input v-model="traceInput" placeholder="输入 traceId" @keyup.enter="loadTrace" />
          <button class="btn" @click="loadTrace">查询</button>
        </div>

        <template v-if="traceResult">
          <div class="trace-summary">
            <span class="badge">操作 {{ traceResult.operationCount }}</span>
            <span class="badge warn">错误 {{ traceResult.errorCount }}</span>
            <span class="badge ok">登录 {{ traceResult.loginCount }}</span>
          </div>

          <ul class="timeline">
            <li v-for="(item, i) in traceResult.timeline" :key="i" :class="`t-${item.log_type}`">
              <span class="dot"></span>
              <div class="t-body">
                <div class="t-head">
                  <span class="badge" :class="item.log_type === 'error' ? 'warn' : item.log_type === 'login' ? 'ok' : ''">
                    {{ item.log_type === 'operation' ? '操作' : item.log_type === 'error' ? '错误' : '登录' }}
                  </span>
                  <span class="nowrap">{{ fmt(item.created_at) }}</span>
                </div>
                <div v-if="item.log_type === 'operation'" class="t-desc">
                  <span class="method" :class="methodClass(String(item.http_method))">{{ item.http_method }}</span>
                  <span class="path">{{ item.api_path }}</span>
                  <span :class="codeClass(Number(item.response_code))">{{ item.response_code }}</span>
                  <span v-if="item.duration_ms != null" class="dim">{{ item.duration_ms }}ms</span>
                </div>
                <div v-else-if="item.log_type === 'error'" class="t-desc">
                  <span class="badge warn">{{ item.error_type }}</span>
                  <span>{{ item.error_code ?? '-' }}</span>
                  <span class="path">{{ item.route ?? '-' }}</span>
                  <span class="dim">{{ item.service ?? '-' }}</span>
                </div>
                <div v-else class="t-desc">
                  <span class="badge" :class="String(item.login_result) === 'success' ? 'ok' : 'warn'">{{ item.login_result }}</span>
                  <span>{{ item.username ?? '-' }}</span>
                  <span class="dim">{{ item.ip ?? '-' }}</span>
                  <span v-if="item.fail_reason" class="dim">{{ item.fail_reason }}</span>
                </div>
              </div>
            </li>
            <li v-if="traceResult.timeline.length === 0" class="empty">该 traceId 下没有任何日志</li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.log-center {
  padding: var(--space-5, 24px);
  color: var(--color-text, #1f2937);
  min-height: 100%;
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.page-head h2 { margin: 0 0 4px; font-size: 20px; }
.sub { margin: 0; font-size: 12px; color: var(--color-text-secondary, #6b7280); }

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  padding-bottom: 8px;
  margin-bottom: 16px;
}
.tab {
  border: 1px solid transparent;
  background: transparent;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}
.tab:hover { background: var(--color-bg, #f3f4f6); color: var(--color-text, #1f2937); }
.tab.active {
  background: #526F61;
  color: #fff;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
}
.card-label { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.card strong { font-size: 24px; }
.card strong.small { font-size: 15px; }

.panel {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
}
.panel h3 { margin: 0 0 12px; font-size: 15px; }

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.filters input,
.filters select {
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  min-width: 140px;
}
.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: #526F61;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn:disabled { opacity: .6; cursor: default; }
.btn-sm {
  padding: 3px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.btn-sm:disabled { opacity: .5; cursor: default; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border, #f0f1f3);
  vertical-align: top;
}
th { font-weight: 600; color: var(--color-text-secondary, #6b7280); font-size: 12px; white-space: nowrap; }
tbody tr:hover { background: #fafafa; }
.empty { text-align: center; color: var(--color-text-secondary, #6b7280); padding: 18px; }
.nowrap { white-space: nowrap; }
.dim { color: var(--color-text-secondary, #6b7280); }
.path { word-break: break-all; max-width: 380px; }
.stack {
  max-width: 520px;
  max-height: 220px;
  overflow: auto;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: pre-wrap;
}

.method {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #eef2f7;
  color: #445;
}
.method.m-get { background: #e8f4ef; color: #2f7d6d; }
.method.m-post { background: #e8eefb; color: #3557a8; }
.method.m-put { background: #fdf3e3; color: #a57417; }
.method.m-delete { background: #fdeaea; color: #b03a3a; }
.method.m-click { background: #f0ecfa; color: #6b4fa8; }

.badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: #eef2f7;
  color: #445;
}
.badge.ok { background: #e8f4ef; color: #2f7d6d; }
.badge.warn { background: #fdeaea; color: #b03a3a; }

.c-ok { color: #2f7d6d; font-weight: 600; }
.c-warn { color: #a57417; font-weight: 600; }
.c-err { color: #b03a3a; font-weight: 600; }

.trace { color: #3557a8; cursor: pointer; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.trace:hover { text-decoration: underline; }

.pager {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.chart { width: 100%; height: 320px; }

.flow { margin: 0; padding-left: 20px; font-size: 13px; line-height: 2; }
.hint { font-size: 12px; color: var(--color-text-secondary, #6b7280); margin: 0 0 10px; }
.related-head { font-size: 13px; margin-bottom: 8px; }

.path-detail {
  margin-top: 14px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
  padding-top: 12px;
}
.path-detail h4 { margin: 0 0 8px; font-size: 13px; }
.path-detail ol { margin: 0 0 10px; padding-left: 20px; font-size: 13px; line-height: 2; }

.trace-summary { display: flex; gap: 8px; margin-bottom: 12px; }
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li {
  position: relative;
  padding: 0 0 16px 22px;
  border-left: 2px solid var(--color-border, #e5e7eb);
  margin-left: 6px;
}
.timeline li:last-child { border-left-color: transparent; padding-bottom: 0; }
.timeline .dot {
  position: absolute;
  left: -6px;
  top: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2f7d6d;
}
.timeline li.t-error .dot { background: #b03a3a; }
.timeline li.t-login .dot { background: #a57417; }
.t-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.t-desc { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; margin-top: 4px; }

.err {
  background: #fdeaea;
  color: #b03a3a;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  margin: 0 0 12px;
}
</style>

