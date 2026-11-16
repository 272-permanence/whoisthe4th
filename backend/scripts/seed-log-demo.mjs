/**
 * @file 日志系统演示数据脚本（技术分享用）
 * @description
 *   通过真实 HTTP 接口向日志系统灌入演示数据，覆盖三类日志 + 全链路追踪。
 *
 * 用法（后端需先启动）：
 *   node scripts/seed-log-demo.mjs                          # 自动跑完
 *   node scripts/seed-log-demo.mjs --step                   # 逐步模式，每步暂停等讲解
 *   BASE_URL=http://127.0.0.1:8000 node scripts/seed-log-demo.mjs
 */

import { createInterface } from 'node:readline';

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const ADMIN = { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' };
const STEP = process.argv.includes('--step') || process.argv.includes('-s');

/** 统一请求封装 */
async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json, traceId: res.headers.get('x-trace-id') };
}

/** 逐步模式：等待回车 */
function wait(label) {
  if (!STEP) return Promise.resolve();
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`   ▶ ${label} (回车继续) `, () => { rl.close(); resolve(); });
  });
}

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
const CLIENT_ERRORS = [
  { errorName: 'TypeError', errorMessage: "Cannot read properties of undefined (reading 'lat')", source: 'amap-loader', pagePath: '/pois' },
  { errorName: 'NetworkError', errorMessage: 'Failed to fetch /api/v1/analytics/overview', source: 'api-client', pagePath: '/dashboard' },
  { errorName: 'ChunkLoadError', errorMessage: 'Loading chunk vendor-echarts failed', source: 'router', pagePath: '/admin/kb' },
];

async function main() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  日志系统演示 · BASE=${BASE}${STEP ? ' · 逐步模式' : ''}`);
  console.log(`${'='.repeat(50)}\n`);

  // 0. health
  const health = await call('GET', '/health');
  console.log(`[0·health] ${health.status} ${health.json?.message ?? ''}`);
  if (health.status !== 200) throw new Error('后端未就绪，请先启动 backend');
  await wait('health OK, 开始造数');

  // 1. 登录日志：成功 + 失败（脱敏可见）
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
  console.log(`\n[1·login_log] ${loginResults.join(' ')}`);
  console.log(`   ↳ 登录日志已落 login_log 表（字段：username（已脱敏）/ login_result / fail_reason）`);
  await wait('登录 5 条已灌入，现在造操作日志');

  // 2. 后端中间件自动落 operation_log
  const apiHits = ['/api/v1/home', '/api/v1/poi', '/api/v1/routes'];
  console.log(`\n[2·middleware] 后端中间件自动记录：`);
  for (const p of apiHits) {
    const r = await call('GET', p, undefined, { Authorization: `Bearer ${adminToken}` });
    console.log(`   GET ${p} => ${r.status}  trace=${r.traceId}`);
  }
  console.log(`   ↳ 这 3 条 operation_log 完全是中间件自动记录的，业务代码一行没改`);
  await wait('3 条中间件 operation_log，现在造前端埋点');

  // 3. 前端点击埋点
  let opCount = 0;
  for (let i = 0; i < 16; i++) {
    const ev = PAGES[i % PAGES.length];
    const r = await call('POST', '/api/v1/logs/operation', {
      resourceId: ev.resourceId, resourceType: ev.resourceType, action: ev.action,
      pagePath: ev.pagePath, userId: 1, timestamp: Date.now(), extra: { seq: i + 1, source: 'seed' },
    });
    if (r.status === 200) opCount++;
  }
  console.log(`\n[3·track] 前端点击埋点 ${opCount}/16 条`);
  await wait('16 条埋点，现在造错误日志');

  // 4. 前端 JS 错误
  let errCount = 0;
  for (let i = 0; i < 6; i++) {
    const e = CLIENT_ERRORS[i % CLIENT_ERRORS.length];
    const r = await call('POST', '/api/v1/logs/error', {
      errorName: e.errorName, errorMessage: e.errorMessage,
      stack: `${e.errorName}: ${e.errorMessage}\n    at ${e.source}.js:42:11\n    at async main.js:7:3`,
      source: e.source, pagePath: e.pagePath, userId: 1,
    });
    if (r.status === 200) errCount++;
  }
  console.log(`\n[4·error_log·client] 前端 JS 错误 ${errCount}/6 条`);

  // 4.5 后端非法 JSON → 全局异常 → error_log
  try {
    const bad = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json ',
    });
    console.log(`[5·error_log·backend] 非法 JSON => ${bad.status}（全局 errorHandler 自动写入 error_log）`);
  } catch (e) {
    console.log(`[5·error_log·backend] 触发失败: ${e.message}`);
  }
  await wait('前端 6 条 + 后端 1 条 error_log，现在做全链路演示');

  // 4.6 全链路 traceId：同一个 id 串起操作 + 错误
  const chainTraceId = `demo-chain-${Date.now()}`;
  const chainHeaders = { 'X-Trace-Id': chainTraceId };
  await call('POST', '/api/v1/logs/operation', {
    resourceId: 'poi-1001', resourceType: 'poi', action: 'detail',
    pagePath: '/pois', userId: 1, extra: { chain: true },
  }, chainHeaders);
  await call('POST', '/api/v1/logs/error', {
    errorName: 'ChainDemoError', errorMessage: '同一 traceId 的链路演示错误',
    stack: 'at chain-demo.js:1:1', source: 'seed', pagePath: '/pois', userId: 1,
  }, chainHeaders);
  console.log(`\n[6·chain] traceId=${chainTraceId}`);
  console.log(`   ↳ 1 条 operation_log + 1 条 error_log 共享同一个 traceId`);
  console.log(`   ↳ 用 GET /api/v1/logs/trace/${chainTraceId} 可以一次性还原全链路`);
  await wait('全链路已串联，现在等 Redis Stream 落库');

  // 等异步
  await new Promise((r) => setTimeout(r, 2000));

  // 5–6. 查询验证
  const adminHeaders = { Authorization: 'Bearer 1:admin:admin', 'x-user-role': 'admin' };
  const summary = [];
  for (const [name, path] of [
    ['operation', '/api/v1/logs/operation?page=1&pageSize=3'],
    ['error', '/api/v1/logs/error?page=1&pageSize=3'],
    ['login', '/api/v1/logs/login?page=1&pageSize=3'],
  ]) {
    const r = await call('GET', path, undefined, adminHeaders);
    const total = r.json?.data?.total;
    summary.push(`${name}=total_${total}`);
  }
  console.log(`\n[summary] ${summary.join('  ')}`);
  const t = await call('GET', `/api/v1/logs/trace/${chainTraceId}`, undefined, adminHeaders);
  console.log(`[trace]  ${chainTraceId} => op=${t.json?.data?.operationCount ?? 0}  err=${t.json?.data?.errorCount ?? 0}  login=${t.json?.data?.loginCount ?? 0}`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  演示数据写入完成`);
  console.log(`${'='.repeat(50)}\n`);
}

main().catch((e) => { console.error('SEED_FAILED:', e.message); process.exit(1); });
