/**
 * @file 数据库连接管理 · SQLite（旧 analytics.db）+ MySQL 读写分离（新）
 * @author 第八组（成员D 重构，成员B 适配）
 * @date 2026-10-15（SQLite）/ 2026-11-08（MySQL 读写分离重构）
 * @description
 *   - SQLite：旧的 analytics.db（better-sqlite3），成员A 语音交互的交互日志表还在用，保持不动
 *   - MySQL：成员D 新引入的读写分离池（master/slave），全组统一用，成员B 的 conversationStore / 成员C 的 authDb / 成员D 的 POI CRUD 全部复用
 *   - 本地未做主从复制时，.env 把 master 和 slave 配成同一端口 = 自动降级为单库
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('db');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =====================================================================
 * 第一部分：SQLite 旧代码（better-sqlite3 · analytics.db）
 * 成员A 的语音交互还在用 interaction_log 表，保持不动。
 * ===================================================================== */

const SQLITE_DB_PATH = path.resolve(__dirname, '../../data/analytics.db');
const SQLITE_DB_DIR = path.dirname(SQLITE_DB_PATH);
let sqliteDb: Database.Database | null = null;

/** 获取 SQLite 单例 */
export function getDb(): Database.Database {
  if (!sqliteDb) {
    fs.mkdirSync(SQLITE_DB_DIR, { recursive: true });
    sqliteDb = new Database(SQLITE_DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    initSqliteTables(sqliteDb);
    log.INFO(`SQLite 已就绪: ${SQLITE_DB_PATH}`);
  }
  return sqliteDb;
}

/** SQLite 内部表初始化（同步，幂等） */
function initSqliteTables(database: Database.Database): void {
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

/* =====================================================================
 * 第二部分：MySQL 读写分离（mysql2/promise）
 * 成员D 重构的全组统一连接池，成员B/C/D 全部复用。
 * ===================================================================== */

/** mysql2 execute() 参数类型 */
export type SqlParam = string | number | null | boolean | Buffer | Date;

let masterPool: Pool | null = null;
let slavePool: Pool | null = null;

function buildPool(host: string, port: number, user: string, password: string, database: string, label: string): Pool {
  const pool = mysql.createPool({
    host, port, user, password, database,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0,
    charset: 'utf8mb4',
  });
  log.INFO(`MySQL ${label} 连接池已创建 ${host}:${port}/${database}`);
  return pool;
}

/** 获取主库池（写操作 / 不确定时用这个最安全） */
export function getMasterPool(): Pool {
  if (!masterPool) {
    const { user, password, database } = config.db;
    const { host, port } = config.db.master;
    masterPool = buildPool(host, port, user, password, database, 'master');
  }
  return masterPool;
}

/** 获取从库池（读操作，减轻主库压力） */
export function getSlavePool(): Pool {
  if (!slavePool) {
    const { user, password, database } = config.db;
    const { host, port } = config.db.slave;
    slavePool = buildPool(host, port, user, password, database, 'slave');
  }
  return slavePool;
}

/** 执行写语句（走主库） */
export async function executeWrite<T = ResultSetHeader>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [result] = await getMasterPool().execute(sql, params);
  return result as T;
}

/** 执行读语句（走从库） */
export async function executeRead<T = RowDataPacket[]>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [rows] = await getSlavePool().execute(sql, params);
  return rows as T;
}

/** 执行"写后回读"（UPDATE/INSERT 后立刻 SELECT 回刚写的数据）→ 强制主库 */
export async function executeReadMaster<T = RowDataPacket[]>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [rows] = await getMasterPool().execute(sql, params);
  return rows as T;
}

/** 执行 DDL / 预处理不支持的命令（TRIGGER/FUNCTION/DROP TABLE 等）→ 主库 */
export async function executeRawDdl(sql: string): Promise<unknown> {
  return getMasterPool().query(sql);
}

/**
 * 初始化成员D 的 analytics 模块 MySQL 表（幂等）
 * 与 backend/sql/01_schema.sql 中 DDL 保持一致；改结构时两处需同步修改。
 * 注意：不叫 initTables，避免和上面 SQLite 的 initSqliteTables 混淆。
 */
export async function initAnalyticsTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS interaction_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        scenic_spot VARCHAR(128),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_interaction_log_created_at (created_at),
        INDEX idx_interaction_log_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='交互日志（成员D）'
    `);
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS sentiment_data (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        log_id BIGINT NOT NULL,
        score DECIMAL(4,2) NOT NULL DEFAULT 0,
        label ENUM('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
        model VARCHAR(64) NOT NULL DEFAULT 'lexicon-v1',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_sentiment_data_log_id (log_id),
        INDEX idx_sentiment_data_label (label),
        INDEX idx_sentiment_data_created_at (created_at),
        CONSTRAINT fk_sentiment_data_interaction_log
          FOREIGN KEY (log_id) REFERENCES interaction_log (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='情感分析结果（成员D）'
    `);
    log.INFO('interaction_log / sentiment_data 表初始化成功');
  } catch (error) {
    log.ERROR(`analytics 模块表初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/** 优雅关闭所有连接（SQLite + MySQL master + MySQL slave） */
export async function closeDb(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  if (masterPool) {
    await masterPool.end();
    masterPool = null;
  }
  if (slavePool) {
    await slavePool.end();
    slavePool = null;
  }
  log.INFO('所有数据库连接已关闭');
}
