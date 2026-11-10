/**
 * @file 成员C 专属数据库：auth.db
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 存放 admin_user（后台账户）、product（商品）两张表。
 *              与其他成员的 db 文件独立，迁移时只需替换这里的 getDb() 实现。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../common/logger.js';

const logger = createLogger('auth-db');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 成员C 的数据库：放到系统临时目录，绕开 backend 目录的锁问题
// TODO: 生产环境改回 backend/data/auth.db
const os = await import('node:os');
const DB_PATH = path.resolve(os.tmpdir(), 'whoisthe4th-auth.db');
const DB_DIR = path.dirname(DB_PATH);
console.log('[auth-db] DB_PATH=', DB_PATH);

let db: Database.Database | null = null;

/** 获取 C 模块专属的 SQLite 数据库单例 */
export function getAuthDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    // tsx 运行时 pragma WAL 会导致 SQLITE_CANTOPEN，auth.db 暂不开启 WAL
    initTables(db);
    seedDefaultAdmin(db);
  }
  return db;
}

/** 初始化数据表（幂等） */
function initTables(database: Database.Database): void {
  database.exec(`
    -- 后台用户表（含 role 字段）
    CREATE TABLE IF NOT EXISTS admin_user (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      nickname      TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_user_username ON admin_user(username);
    CREATE INDEX IF NOT EXISTS idx_admin_user_role     ON admin_user(role);

    -- 商品表
    CREATE TABLE IF NOT EXISTS product (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      description  TEXT,
      price        REAL    NOT NULL DEFAULT 0,
      stock        INTEGER NOT NULL DEFAULT 0,
      category     TEXT,
      image_url    TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_category ON product(category);
    CREATE INDEX IF NOT EXISTS idx_product_name     ON product(name);
  `);
}

/** 首次启动时写入一个默认管理员（username=admin, password=admin123） */
function seedDefaultAdmin(database: Database.Database): void {
  const count = database.prepare('SELECT COUNT(*) AS c FROM admin_user').get() as { c: number };
  if (count.c === 0) {
    // 延迟导入避免循环依赖：这里用 bcryptjs hash 默认密码
    // hash('admin123', 10) —— 预计算值（bcrypt 每次 salt 不同，但验证时自动匹配）
    // 我们用 placeholder，让 authService 在 register 时才真正 hash
    // 所以这里直接用 authService.hashPasswordSync
    void (async () => {
      const bcrypt = (await import('bcryptjs')).default;
      const hash = bcrypt.hashSync('admin123', 10);
      database
        .prepare(
          `INSERT INTO admin_user (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)`
        )
        .run('admin', hash, 'admin', '超级管理员');
      logger.INFO('已创建默认管理员账户 admin / admin123');
    })();
  }
}

/** 关闭数据库（测试用） */
export function closeAuthDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ===================== admin_user 便捷函数 =====================

export type UserRole = 'admin' | 'user';

export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

/** 按用户名查询（登录/注册时校验用） */
export function findUserByUsername(username: string): AdminUser | null {
  return getAuthDb()
    .prepare('SELECT * FROM admin_user WHERE username = ?')
    .get(username) as AdminUser | null;
}

/** 按 id 查询 */
export function findUserById(id: number): AdminUser | null {
  return getAuthDb().prepare('SELECT * FROM admin_user WHERE id = ?').get(id) as AdminUser | null;
}

/**
 * 新增用户
 * @returns 新插入行的 id
 */
export function createUser(input: {
  username: string;
  passwordHash: string;
  role?: UserRole;
  nickname?: string;
}): number {
  const info = getAuthDb()
    .prepare(
      `INSERT INTO admin_user (username, password_hash, role, nickname) VALUES (?, ?, ?, ?)`
    )
    .run(
      input.username,
      input.passwordHash,
      input.role ?? 'user',
      input.nickname ?? null
    );
  return Number(info.lastInsertRowid);
}

// ===================== product 便捷函数 =====================

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  stock: number;
  category?: string;
  imageUrl?: string;
}

/** 商品列表（支持可选 category 过滤） */
export function listProducts(category?: string): Product[] {
  const sql = category
    ? 'SELECT * FROM product WHERE category = ? ORDER BY id DESC'
    : 'SELECT * FROM product ORDER BY id DESC';
  return (category
    ? getAuthDb().prepare(sql).all(category)
    : getAuthDb().prepare(sql).all()) as Product[];
}

export function findProductById(id: number): Product | null {
  return getAuthDb().prepare('SELECT * FROM product WHERE id = ?').get(id) as Product | null;
}

export function createProduct(input: ProductInput): number {
  const now = new Date().toISOString();
  const info = getAuthDb()
    .prepare(
      `INSERT INTO product (name, description, price, stock, category, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.description ?? null,
      input.price,
      input.stock,
      input.category ?? null,
      input.imageUrl ?? null,
      now,
      now
    );
  return Number(info.lastInsertRowid);
}

export function updateProduct(id: number, input: Partial<ProductInput>): number {
  const existing = findProductById(id);
  if (!existing) return 0;
  const now = new Date().toISOString();
  const stmt = getAuthDb().prepare(`
    UPDATE product
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        stock = COALESCE(?, stock),
        category = COALESCE(?, category),
        image_url = COALESCE(?, image_url),
        updated_at = ?
    WHERE id = ?
  `);
  const info = stmt.run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    input.price ?? existing.price,
    input.stock ?? existing.stock,
    input.category ?? existing.category,
    input.imageUrl ?? existing.image_url,
    now,
    id
  );
  return info.changes;
}

export function deleteProduct(id: number): number {
  const info = getAuthDb().prepare('DELETE FROM product WHERE id = ?').run(id);
  return info.changes;
}
