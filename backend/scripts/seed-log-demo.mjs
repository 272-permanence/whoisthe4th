/**
 * @file 日志系统演示数据脚本（技术分享用）
 * @description
 *   通过真实 HTTP 接口向日志系统灌入演示数据，覆盖三类日志：
 *     1. operation_log  行为/操作日志（前端埋点上报 + 后端请求中间件）
 *     2. error_log      错误日志（前端 JS 错误上报 + 后端业务异常）
 *     3. login_log      登录日志（成功 + 失败，用于暴力破解审计）
 *   并演示「全链路追踪」：按 traceId 串联三类日志。
 *
 * 用法（后端需先启动）：
 *   node scripts/seed-log-demo.mjs                    # 默认 http://localhost:8000
 *   BASE_URL=http://127.0.0.1:8000 node scripts/seed-log-demo.mjs
 *
 * 前置条件：
 *   - MySQL 已建库 scenic_ai 并导入 sql/01_schema.sql、sql/03_log_schema.sql
 *   - Redis 可选：开启则走 Stream 队列，未开启自动降级直写 MySQL
 *   - admin 账号存在（默认 admin / admin123，由后端初始化）
 */

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const ADMIN = { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' };

/** 统一请求封装：返回状态码、JSON 体、响应头 traceId */
async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 非 JSON 响应忽略 */
  }
  return { status: res.status, json, traceId: res.headers.get('x-trace-id') };
}

/** 演示用页面路径与资源 */
const PAGES = [
  { pagePath: '/home', resourceType: 'page', resourceId: 'home', action: 'view' },
  { pagePath: '/interaction', resourceType: 'ai_digital_human', resourceId: 'xiaodao', action: 'voice_chat' },
  { pagePath: '/pois', resourceType: 'poi', resourceId: 'poi-1001', action: 'view' },
  { pagePath: '/pois', resourceType: 'poi', resourceId: 'poi-1002', action: 'detail' },
  { pagePath: '/navigate', resourceType: 'route', resourceId: 'route-2001', action: 'navigate' },
  { pagePath: '/lost-found', resourceType: 'lost_found', resourceId: 'lf-3001', action: 'search' },
  { pagePath: '/admin/products', resourceType: 'product', resourceId: 'sku-4001', action: 'create' },
  { pagePath: '/dashboard', resourceType: 'dashboard', resourceId: 'analytics', action: 'view' },
];

/** 演示用前端错误 */
const CLIENT_ERRORS = [
  { errorName: 'TypeError', errorMessage: "Cannot read properties of undefined (reading 'lat')", source: 'amap-loader', pagePath: '/pois' },
  { errorName: 'NetworkError', errorMessage: 'Failed to fetch /api/v1/analytics/overview', source: 'api-client', pagePath: '/dashboard' },
  { errorName: 'ChunkLoadError', errorMessage: 'Loading chunk vendor-echarts failed', source: 'router', pagePath: '/admin/kb' },
];

async function main() {
  console.log(`\n=== 日志系统演示数据 ===\nBASE: ${BASE}\n`);

  // 0. 健康检查
  const health = await call('GET', '/health');
  console.log(`[health] ${health.status} ${health.json?.message ?? ''}`);
  if (health.status !== 200) throw new Error('后端未就绪，请先启动 backend');

  // 1. 登录日志：成功 + 失败（失败用于暴力破解审计演示）
  let adminToken = '';
  const loginResults = [];
  const ok = await call('POST', '/api/v1/auth/login', ADMIN);
  loginResults.push(`success(${ok.status})`);
  adminToken = ok.json?.data?.token || '';
  for (const badPwd of ['wrong-1', 'wrong-2', 'wrong-3']) {
    const r = await call('POST', '/api/v1/auth/login', { username: ADMIN.username, password: badPwd });
    loginResults.push(`fail(${r.status})`);
  }
  const ghost = await call('POST', '/api/v1/auth/login', { username: 'ghost_user', password: 'x' });
  loginResults.push(`unknown-user(${ghost.status})`);
  console.log(`[login_log] ${loginResults.join(' ')}`);

  // 2. 操作日志：业务请求（后端中间件自动落库）
  const apiHits = ['/api/v1/home', '/api/v1/poi', '/api/v1/routes'];
  for (const p of apiHits) {
    const r = await call('GET', p, undefined, { Authorization: `Bearer ${adminToken}` });
    console.log(`[operation_log·middleware] GET ${p} => ${r.status} trace=${r.traceId}`);
  }

  // 3. 操作日志：前端点击埋点上报
  const traceIds = [];
  let opCount = 0;
  for (let i = 0; i < 16; i++) {
    const ev = PAGES[i % PAGES.length];
    const r = await call('POST', '/api/v1/logs/operation', {
      resourceId: ev.resourceId,
      resourceType: ev.resourceType,
      action: ev.action,
      pagePath: ev.pagePath,
      userId: 1,
      timestamp: Date.now(),
      extra: { seq: i + 1, source: 'seed-script' },
    });
    if (r.status === 200) opCount++;
    if (r.traceId) traceIds.push(r.traceId);
  }
  console.log(`[operation_log·track] 写入 ${opCount}/16 条`);

  // 4. 错误日志：前端 JS 错误上报
  let errCount = 0;
  const errTraceIds = [];
  for (let i = 0; i < 6; i++) {
    const e = CLIENT_ERRORS[i % CLIENT_ERRORS.length];
    const r = await call('POST', '/api/v1/logs/error', {
      errorName: e.errorName,
      errorMessage: e.errorMessage,
      stack: `${e.errorName}: ${e.errorMessage}\n    at ${e.source}.js:42:11\n    at async main.js:7:3`,
      source: e.source,
      pagePath: e.pagePath,
      userId: 1,
    });
    if (r.status === 200) errCount++;
    if (r.traceId) errTraceIds.push(r.traceId);
  }
  console.log(`[error_log] 写入 ${errCount}/6 条`);

  // 4.5 后端统一异常控制：发送非法 JSON 触发全局 errorHandler → errorLogger 落库
  try {
    const bad = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json ',
    });
    console.log(`[error_log·backend] 非法 JSON => ${bad.status}（统一异常处理器已记录）`);
  } catch (e) {
    console.log(`[error_log·backend] 触发失败: ${e.message}`);
  }

  // 4.6 全链路追踪演示：同一 traceId 贯穿「操作 + 错误」两类日志
  //     前端 apiClient 把 X-Trace-Id 回写 localStorage，后续请求携带同一个 id，
  //     即可用 GET /api/v1/logs/trace/:traceId 还原用户同一次操作的完整链路。
  const chainTraceId = `demo-chain-${Date.now()}`;
  const chainHeaders = { 'X-Trace-Id': chainTraceId };
  await call(
    'POST',
    '/api/v1/logs/operation',
    { resourceId: 'poi-1001', resourceType: 'poi', action: 'detail', pagePath: '/pois', userId: 1, extra: { chain: true } },
    chainHeaders
  );
  await call(
    'POST',
    '/api/v1/logs/error',
    { errorName: 'ChainDemoError', errorMessage: '同一 traceId 的链路演示错误', stack: 'at chain-demo.js:1:1', source: 'seed-script', pagePath: '/pois', userId: 1 },
    chainHeaders
  );
  console.log(`[chain] traceId=${chainTraceId} 已串联 1 条操作 + 1 条错误`);

  // 等待异步队列落库（Redis Stream 消费者批量写入）
  await new Promise((r) => setTimeout(r, 2000));

  // 5. 后端管理员查询接口自查
  const adminHeaders = { Authorization: 'Bearer 1:admin:admin', 'x-user-role': 'admin' };
  const summary = [];
  for (const [name, path] of [
    ['operation', '/api/v1/logs/operation?page=1&pageSize=5'],
    ['error', '/api/v1/logs/error?page=1&pageSize=5'],
    ['login', '/api/v1/logs/login?page=1&pageSize=5'],
  ]) {
    const r = await call('GET', path, undefined, adminHeaders);
    const total = r.json?.data?.total;
    summary.push(`${name}=${r.status}(total=${total})`);
  }
  console.log(`[query] ${summary.join(' ')}`);

  // 6. 全链路追踪演示：用固定 traceId 串起操作 + 错误两类日志
  const t = await call('GET', `/api/v1/logs/trace/${chainTraceId}`, undefined, adminHeaders);
  console.log(
    `[trace] ${chainTraceId} => op=${t.json?.data?.operationCount} err=${t.json?.data?.errorCount} login=${t.json?.data?.loginCount}`
  );

  console.log('\n=== 演示数据写入完成 ===\n');
}

main().catch((e) => {
  console.error('SEED_FAILED:', e.message);
  process.exit(1);
});
