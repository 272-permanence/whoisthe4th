/**
 * @file 一键清空日志系统（技术分享前 10 秒预热用）
 * @description
 *   TRUNCATE 三张日志表 + 删 Redis Stream，让 seed 脚本每次从干净状态开始。
 *   分享前先跑：node scripts/reset-logs.mjs && node scripts/seed-log-demo.mjs
 */
import mysql from 'mysql2/promise';

// 读 backend/.env（简单解析，不依赖 dotenv）
const envFile = new URL('.env', import.meta.url);
const envText = await fetch(envFile).then((r) => r.text()).catch(() => '');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'scenic_ai',
};

const TABLES = ['operation_log', 'error_log', 'login_log'];
const STREAM = process.env.REDIS_LOG_STREAM || 'scenic:log:stream';

console.log(`[reset] MySQL ${DB.host}:${DB.port}/${DB.database}`);

// 1. 清 MySQL
const conn = await mysql.createConnection({ ...DB, multipleStatements: true });
for (const t of TABLES) {
  try {
    await conn.execute(`TRUNCATE TABLE ${t}`);
    console.log(`  mysql TRUNCATE ${t} ✔`);
  } catch (e) {
    console.log(`  mysql TRUNCATE ${t} ✘ ${e.message}`);
  }
}
await conn.end();

// 2. 清 Redis Stream（XTRIM 清空消息但保留 Stream key + consumer group，不影响后端消费者）
try {
  const { default: Redis } = await import('ioredis');
  const r = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), connectTimeout: 1000 });
  const len = await r.xlen(STREAM);
  if (len > 0) {
    // XTRIM MAXLEN 0：清空所有消息但 Stream key 和 consumer group 还在
    await r.xtrim(STREAM, 'MAXLEN', '0');
    console.log(`  redis XTRIM ${STREAM} (清 ${len} 条，Stream 保留) ✔`);
  } else {
    console.log(`  redis ${STREAM} 本来就是空的`);
  }
  // 强制把 consumer group 的 last-delivered-id 重置为 0
  // 万一之前有人 XADD 过又 DEL 重建过，确保 > 语义能读到新消息
  const group = process.env.REDIS_LOG_GROUP || 'log-writer';
  try {
    await r.xgroup('SETID', STREAM, group, '0');
    console.log(`  redis XGROUP SETID ${group} = 0 ✔`);
  } catch { /* group 不存在也没关系，后端启动时会 CREATE */ }
  await r.quit();
} catch (e) {
  console.log(`  redis 跳过（未连接）: ${e.message}`);
}

console.log('[reset] 完成 ✅\n');
