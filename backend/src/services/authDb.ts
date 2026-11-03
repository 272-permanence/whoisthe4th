/**
 * @file auth.db 数据库层（better-sqlite3）
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 存放 admin_user 和 product 表，与 analytics.db 独立
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.resolve(__dirname, '../..');
// TODO: 生产环境改回 path.resolve(BACKEND_ROOT, 'data/auth.db')
// 当前用系统临时目录绕开 tsx watch + WAL 共存时的 SQLITE_CANTOPEN 问题
const DB_PATH = path.resolve(os.tmpdir(), 'whoisthe4th-auth.db');

let db: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (!db) {
    // 确保目录存在（tmpdir 一定存在，这里保底）
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
    seedDefaultAdmin(db);
    console.log(`[authDb] auth.db 已打开: ${DB_PATH}`);
  }
  return db;
}

function initTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      nickname TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_category ON product(category);
  `);
}

/**
 * 首次启动时写入默认管理员（同步，避免异步竞态）
 * 密码: admin123
 */
function seedDefaultAdmin(database: Database.Database): void {
  const exists = database.prepare('SELECT id FROM admin_user WHERE username = ?').get('admin');
  if (exists) return;

  // 同步 bcrypt hash，避免异步导致后端启动完了但种子还没写入
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);
  database
    .prepare(
      `INSERT INTO admin_user (username, password_hash, role, nickname)
       VALUES (?, ?, 'admin', '系统管理员')`
    )
    .run('admin', hash);
  console.log('[authDb] 默认管理员已创建: admin / admin123');
}
