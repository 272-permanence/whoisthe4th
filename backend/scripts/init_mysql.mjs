// -*- coding: utf-8 -*-
/**
 * 一键建库 + 执行全组建表脚本
 * 用法：node scripts/init_mysql.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SCHEMA_PATH = path.join(ROOT, 'sql', '01_schema.sql');
const DB_NAME = 'scenic_ai';
const USER = 'root';
const PASS = '';
const HOST = '127.0.0.1';
const PORT = 3306;

async function main() {
  // 1) 读 schema 文件
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

  // 2) 连接 MySQL（先不带 database，因为库还没建）
  const conn = await mysql.createConnection({
    host: HOST, port: PORT, user: USER, password: PASS,
    multipleStatements: true, charset: 'utf8mb4',
  });
  console.log(`[ok] connected to ${USER}@${HOST}:${PORT}`);

  // 3) 建库
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`);
  console.log(`[ok] database ${DB_NAME} ready`);

  // 4) 切库
  await conn.query(`USE \`${DB_NAME}\``);

  // 5) MySQL 5.5 不允许 DATETIME DEFAULT CURRENT_TIMESTAMP，
  //    临时替换为 TIMESTAMP 再执行；原 01_schema.sql 保持不动（全组统一文件）
  const patched = schema
    .replace(/DATETIME\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi,
             'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    .replace(/DATETIME\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/gi,
             'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

  await conn.query(patched);
  console.log('[ok] schema executed');

  // 6) 验证：SHOW TABLES
  const [rows] = await conn.query('SHOW TABLES');
  const tables = rows.map(r => Object.values(r)[0]).sort();
  console.log(`\n[verify] ${tables.length} tables in ${DB_NAME}:`);
  tables.forEach(t => console.log('  -', t));

  await conn.end();
  console.log('\n[done]');
}

main().catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
