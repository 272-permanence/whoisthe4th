﻿﻿﻿/**
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

// ============ 内容管理（成员C的 content/adminContent 路由使用） ============
export type ContentType = 'carousel' | 'scenic' | 'route' | 'announcement' | 'about';

// ============ 用户/商品（成员C的 c-auth-product 分支） ============

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
    seedDefaultProducts(db);
  }
  return db;
}

/** 安全补列：SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS，需要手动检查 */
function addColumnIfNotExists(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/** 初始化数据表（幂等） */
function initTables(database: Database.Database): void {
  database.exec(`
    -- 后台用户表（含 role + status + 全部外部身份绑定列）
    CREATE TABLE IF NOT EXISTS admin_user (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      nickname      TEXT,
      status        TEXT    NOT NULL DEFAULT 'active',
      email         TEXT,
      phone         TEXT,
      wechat_openid TEXT,
      sso_uid       TEXT,
      cert_fingerprint TEXT,
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

    -- 商品点赞/收藏记录（同一用户对同一商品同一动作去重）
    CREATE TABLE IF NOT EXISTS product_like (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id    TEXT    NOT NULL DEFAULT 'anonymous',
      action     TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, user_id, action)
    );

    CREATE INDEX IF NOT EXISTS idx_product_like_pid ON product_like(product_id);

    -- CMS 内容表（content / adminContent 路由使用）
    CREATE TABLE IF NOT EXISTS content (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      subtitle    TEXT,
      content     TEXT,
      image_url   TEXT,
      extra_json  TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      published   INTEGER NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_content_type      ON content(type);
    CREATE INDEX IF NOT EXISTS idx_content_published ON content(published);
  `);

  // 对已存在的老库（队友之前的 auth.db）幂等补列
  migrateSchema(database);
}

/** 对已存在的老库补列（队友 main 之前只做了账号密码，现在加统一认证外部身份列） */
function migrateSchema(db: Database.Database): void {
  addColumnIfNotExists(db, 'admin_user', 'status', "TEXT NOT NULL DEFAULT 'active'");
  addColumnIfNotExists(db, 'admin_user', 'email', 'TEXT');
  addColumnIfNotExists(db, 'admin_user', 'phone', 'TEXT');
  addColumnIfNotExists(db, 'admin_user', 'wechat_openid', 'TEXT');
  addColumnIfNotExists(db, 'admin_user', 'sso_uid', 'TEXT');
  addColumnIfNotExists(db, 'admin_user', 'cert_fingerprint', 'TEXT');

  // 商品互动字段（首页热度排序 + 点赞收藏持久化，全站唯一商品数据源 = SQLite）
  addColumnIfNotExists(db, 'product', 'like_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists(db, 'product', 'favorite_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists(db, 'product', 'sales', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists(db, 'product', 'status', 'INTEGER NOT NULL DEFAULT 1');

  // SQLite UNIQUE 索引允许 NULL，一个用户可绑多个外部身份通道
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_user_email ON admin_user(email)'); } catch { /* 忽略 */ }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_user_phone ON admin_user(phone)'); } catch { /* 忽略 */ }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_user_wechat ON admin_user(wechat_openid)'); } catch { /* 忽略 */ }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_user_sso ON admin_user(sso_uid)'); } catch { /* 忽略 */ }
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_user_cert ON admin_user(cert_fingerprint)'); } catch { /* 忽略 */ }
}

/** 首次启动时写入一个默认管理员（username=admin, password=admin123） */
function seedDefaultAdmin(database: Database.Database): void {
  const count = database.prepare('SELECT COUNT(*) AS c FROM admin_user').get() as { c: number };
  if (count.c === 0) {
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

/** 首次启动时写入一批示例商品（文创/纪念/食品/票券 各若干） */
function seedDefaultProducts(database: Database.Database): void {
  const count = database.prepare('SELECT COUNT(*) AS c FROM product').get() as { c: number };
  if (count.c > 0) return;

  const rows = [
    // 文创
    ['景区地图冰箱贴', '磁吸冰箱贴，软胶材质，直径 6cm', 18.00, 200, '文创', null],
    ['古风折扇', '绢布竹骨，景区限定图案', 88.00, 50, '文创', null],
    ['手绘明信片套装', '10 张装，景区十景手绘版', 35.00, 300, '文创', null],
    ['景区集章册', '打卡集章专用，A5 开本', 28.00, 150, '文创', null],
    ['帆布 tote 包', '水洗棉帆布，景区 logo 印花', 65.00, 80, '文创', null],

    // 纪念
    ['铜质纪念币', '景区主题，配礼盒', 128.00, 30, '纪念', null],
    ['珐琅钥匙扣', '金属珐琅款，可做伴手礼', 25.00, 500, '纪念', null],
    ['徽章套装', '一套 5 枚，景区标志性图案', 48.00, 120, '纪念', null],
    ['银饰吊坠', '925 银，景区塔影造型', 168.00, 0, '纪念', null],

    // 食品
    ['桂花糕礼盒', '传统手工糕点，景区特产', 58.00, 400, '食品', null],
    ['高山云雾茶', '景区自产，250g 礼盒装', 188.00, 60, '食品', null],
    ['水果蜜饯组合', '景区特色，3 瓶装', 42.00, 250, '食品', null],
    ['农家葛根粉', '500g 袋装', 32.00, 180, '食品', null],

    // 票券
    ['景区通票（成人）', '含全部景点门票，当日有效', 120.00, 9999, '票券', null],
    ['景区通票（学生）', '凭学生证入园，半价', 60.00, 9999, '票券', null],
    ['观光车单程票', '景区内观光车单程', 10.00, 9999, '票券', null],
    ['索道往返票', '上山索道往返，含保险', 80.00, 9999, '票券', null],
  ] as const;

  const stmt = database.prepare(
    `INSERT INTO product (name, description, price, stock, category, image_url) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertMany = database.transaction(
    (items: readonly (readonly [string, string, number, number, string, string | null])[]) => {
      for (const row of items) stmt.run(...row);
    }
  );
  insertMany(rows);
  logger.INFO(`已写入 ${rows.length} 条示例商品 seed`);
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
  like_count?: number;
  favorite_count?: number;
  sales?: number;
  status?: number;
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

/** 首页热销商品：按点赞、销量排序（status=1 只取上架） */
export function listHotProducts(limit = 6): Product[] {
  return getAuthDb()
    .prepare(
      `SELECT * FROM product WHERE status = 1
       ORDER BY like_count DESC, sales DESC, id ASC LIMIT ?`
    )
    .all(limit) as Product[];
}

/** 上架商品总数（首页统计用） */
export function countProducts(): number {
  const row = getAuthDb()
    .prepare('SELECT COUNT(*) AS c FROM product WHERE status = 1')
    .get() as { c: number };
  return row?.c ?? 0;
}

/** 商品点赞/收藏切换（同一用户同一动作幂等，返回切换后的状态与计数） */
export function toggleProductReaction(
  productId: number,
  userId: string,
  action: 'like' | 'favorite'
): { active: boolean; count: number } {
  const db = getAuthDb();
  const column = action === 'like' ? 'like_count' : 'favorite_count';
  const existing = db
    .prepare('SELECT id FROM product_like WHERE product_id = ? AND user_id = ? AND action = ?')
    .get(productId, userId, action) as { id: number } | undefined;

  if (existing) {
    db.prepare('DELETE FROM product_like WHERE id = ?').run(existing.id);
    db.prepare(`UPDATE product SET ${column} = MAX(${column} - 1, 0) WHERE id = ?`).run(productId);
  } else {
    db.prepare('INSERT OR IGNORE INTO product_like (product_id, user_id, action) VALUES (?, ?, ?)').run(
      productId,
      userId,
      action
    );
    db.prepare(`UPDATE product SET ${column} = ${column} + 1 WHERE id = ?`).run(productId);
  }

  const row = db.prepare(`SELECT ${column} AS c FROM product WHERE id = ?`).get(productId) as
    | { c: number }
    | undefined;
  return { active: !existing, count: row?.c ?? 0 };
}
