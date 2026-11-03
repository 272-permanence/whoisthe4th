/**
 * @file auth.db 数据库层（better-sqlite3）
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 存放 admin_user 和 product 表，与 analytics.db 独立
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.resolve(BACKEND_ROOT, 'data/auth.db');

let db: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
    seedDefaultAdmin(db);
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

  const hash = bcrypt.hashSync('admin123', 10);
  database
    .prepare(
      `INSERT INTO admin_user (username, password_hash, role, nickname)
       VALUES (?, ?, 'admin', '系统管理员')`
    )
    .run('admin', hash);
}
