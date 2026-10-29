/**
 * @file 失物招领模块 · MySQL 数据库连接管理（成员D）
 * @author 第八组（成员D）
 * @date 2026-10-27
 * @description 开发阶段走单一连接池（config.mysql 3306），简化本地调试。
 *              部署时如需读写分离，把 executeRead 切到从库即可。
 *              同时内置 initTables() 保证「忘记跑脚本」时后端也能自建表。
 */

import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('lostfound-db');

type SqlParam = string | number | boolean | Date | null;

let pool: mysql.Pool | null = null;

/** 获取连接池（开发阶段单一 3306） */
export function getPool(): mysql.Pool {
  if (!pool) {
    try {
      pool = mysql.createPool({
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4',
      });
      log.INFO(`失物招领模块连接成功 host=${config.mysql.host} port=${config.mysql.port}`);
    } catch (error) {
      log.ERROR(`失物招领模块连接失败: ${String(error)}`);
      throw error;
    }
  }
  return pool;
}

/** 读/写（开发阶段共用一个池，部署时再分） */
export async function executeSql<T = mysql.RowDataPacket[]>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T;
}

/** 写操作的便捷方法，返回 insertId / affectedRows */
export async function executeWrite<T = mysql.ResultSetHeader>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [result] = await getPool().execute(sql, params);
  return result as T;
}

/**
 * 自建表（幂等）：保证「忘记跑 02_schema_lost_found.sql」时后端也能起来
 */
export async function initTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS lost_found (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('lost','found') NOT NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'other',
        title VARCHAR(128) NOT NULL,
        description TEXT,
        location VARCHAR(255),
        image_url VARCHAR(512),
        contact VARCHAR(128),
        publisher_name VARCHAR(64),
        user_id VARCHAR(64),
        status ENUM('open','resolved','expired') NOT NULL DEFAULT 'open',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL,
        INDEX idx_lf_type (type),
        INDEX idx_lf_status (status),
        INDEX idx_lf_category (category),
        INDEX idx_lf_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 触发器：MySQL 5.5 双 TIMESTAMP 兼容（如果不存在才创建）
    await executeWrite(`DROP TRIGGER IF EXISTS trg_lost_found_updated_at`).catch(() => {});
    await executeWrite(`
      CREATE TRIGGER trg_lost_found_updated_at BEFORE UPDATE ON lost_found
        FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP
    `);

    log.INFO('lost_found 表 + 触发器初始化成功');
  } catch (error) {
    log.ERROR(`lost_found 表初始化失败: ${String(error)}`);
    throw error;
  }
}

/** 关闭连接池 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.INFO('失物招领连接池已关闭');
  }
}
