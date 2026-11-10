/** 快速验证：查三张日志表有没有数据落库 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const conn = await mysql.createConnection({
  host: process.env.DB_MASTER_HOST || '127.0.0.1',
  port: Number(process.env.DB_MASTER_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'scenic_ai'
});

const tables = ['login_log', 'operation_log', 'error_log'];
for (const t of tables) {
  try {
    const [count] = await conn.execute(`SELECT COUNT(*) as c FROM ${t}`);
    const [rows] = await conn.execute(`SELECT * FROM ${t} ORDER BY id DESC LIMIT 3`);
    console.log(`\n=== ${t} (${count[0].c} rows) ===`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.log(`\n=== ${t}: ${e.message} ===`);
  }
}

await conn.end();
console.log('\n✅ Done');
