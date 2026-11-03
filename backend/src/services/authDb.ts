/**
 * @file auth.db 数据库层（better-sqlite3）
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 存放 admin_user、product、content 表
 *              - admin_user: 账号/角色/状态
 *              - product: 商品化（可 SKU 扩展）
 *              - content: 统一 CMS 内容表（type 区分轮播/景点/路线/公告/关于我们）
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

export type ContentType = 'carousel' | 'scenic' | 'route' | 'announcement' | 'about';

let db: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
    migrateSchema(db); // admin_user 表补 status 列
    seedDefaultAdmin(db);
    seedDefaultContent(db);
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
      status TEXT NOT NULL DEFAULT 'active',
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
      published INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      content TEXT,
      image_url TEXT,
      extra_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_category ON product(category);
    CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
  `);
}

/** 给已有的旧表补列（幂等） */
function migrateSchema(database: Database.Database): void {
  // admin_user.status
  try { database.prepare('SELECT status FROM admin_user LIMIT 1').run(); }
  catch { database.exec('ALTER TABLE admin_user ADD COLUMN status TEXT NOT NULL DEFAULT "active"'); }
  // product.published
  try { database.prepare('SELECT published FROM product LIMIT 1').run(); }
  catch { database.exec('ALTER TABLE product ADD COLUMN published INTEGER NOT NULL DEFAULT 1'); }
}

function seedDefaultAdmin(database: Database.Database): void {
  const exists = database.prepare('SELECT id FROM admin_user WHERE username = ?').get('admin');
  if (exists) return;
  const hash = bcrypt.hashSync('admin123', 10);
  database
    .prepare(
      `INSERT INTO admin_user (username, password_hash, role, nickname, status)
       VALUES (?, ?, 'admin', '系统管理员', 'active')`
    )
    .run('admin', hash);
}

/** 首次写入 CMS 默认内容（已发布状态，用户端直接可见） */
function seedDefaultContent(database: Database.Database): void {
  const count = (database.prepare('SELECT COUNT(*) as c FROM content').get() as { c: number }).c;
  if (count > 0) return;

  const insert = database.prepare(`
    INSERT INTO content (type, title, subtitle, content, image_url, extra_json, sort_order, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  // 首页轮播图 3 张
  insert.run(
    'carousel', '西湖春色归', '绿水染新绿',
    '西湖十景之一，苏堤春晓',
    'https://trae-api-cn.mchost.guru/api/ide/v1/tool_text_to_image?prompt=West%20Lake%20Hangzhou%20spring%20view%20sunset%20reflection&image_size=landscape_16_9',
    '{"link":"/interaction"}', 1
  );
  insert.run(
    'carousel', '雷峰夕照', '暮色苍茫',
    '雷峰塔下，千年白蛇传说',
    'https://trae-api-cn.mchost.guru/api/ide/v1/tool_text_to_image?prompt=Leifeng%20Pagoda%20Hangzhou%20sunset%20evening&image_size=landscape_16_9',
    '{"link":"/qa"}', 2
  );
  insert.run(
    'carousel', '三潭印月', '湖中之月',
    '西湖三岛之一，赏月圣地',
    'https://trae-api-cn.mchost.guru/api/ide/v1/tool_text_to_image?prompt=Three%20Pools%20Mirroring%20Moon%20West%20Lake%20night&image_size=landscape_16_9',
    '{"link":"/dashboard"}', 3
  );
  // 公告 1 条
  insert.run(
    'announcement', '系统上线啦', '欢迎体验',
    '西湖文化 AI 导览系统正式上线！智能问答、数字人语音交互、数据大屏等功能全部开放，欢迎大家多多反馈。',
    null, '{"level":"info"}', 1
  );
  // 关于我们
  insert.run(
    'about', '关于我们', '团队介绍',
    '第八组景区导览 AI 数字人项目，基于 LLM + RAG + SSE 流式输出技术栈，打造沉浸式智能导览体验。成员A负责语音交互，成员B负责 RAG Agent，成员C负责后台基石与商业化，成员D负责 C 端前台。',
    null, null, 1
  );
}
