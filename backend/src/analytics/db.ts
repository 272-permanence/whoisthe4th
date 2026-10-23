/**
 * @file SQLite 数据库初始化与连接管理
 * @author 第八组
 * @date 2026-10-15
 * @description 初始化交互日志表，提供数据库单例
 */

import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件存放在 backend/data/analytics.db
const DB_PATH = path.resolve(__dirname, '../../data/analytics.db');
// data/ 目录被 .gitignore 忽略，全新克隆的仓库不会自带，需在首次连接前自动创建
const DB_DIR = path.dirname(DB_PATH);

let db: Database.Database | null = null;

/**
 * 获取数据库单例
 * @returns SQLite 数据库实例
 */
export function getDb(): Database.Database {
  if (!db) {
    // 确保 data/ 目录存在，避免全新克隆的仓库因目录缺失导致 SQLite 直接报 ENOENT
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

/**
 * 初始化数据表（幂等操作，表已存在则跳过）
 */
function initTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS interaction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      sentiment_score REAL DEFAULT 0,
      sentiment_label TEXT DEFAULT 'neutral',
      scenic_spot TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_interaction_created_at
      ON interaction_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_interaction_user_id
      ON interaction_log(user_id);
  `);
}

/**
 * 关闭数据库连接
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
