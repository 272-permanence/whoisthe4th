/**
 * @file 失物招领模块 · MySQL 数据库访问（成员D）
 * @author 第八组（成员D）
 * @date 2026-10-27
 * @description 统一复用 analytics/db.ts 提供的 master（写）/ slave（读）连接池，
 *              不再独立建池。理由：
 *                1) 读写分离全项目只开两套池（master 3307 + slave 3308），避免重复配置
 *                2) 主从复制只在 MySQL 层做，应用只负责按操作类型路由 SQL
 *                3) 本模块的 SELECT 走从库、INSERT/UPDATE/DELETE/CREATE TABLE 走主库
 */

import { createLogger } from '../common/logger.js';
import { executeRead, executeWrite, executeReadMaster, executeRawDdl } from '../analytics/db.js';

const log = createLogger('lostfound-db');

/**
 * 自建表（幂等） —— DDL 必须走主库，从库 read_only 会拒绝
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

    // 触发器：MySQL 5.5 双 TIMESTAMP 兼容（先删后建）
    // DDL 必须用 query() 不走预处理，否则 MySQL 5.5 会报 "not supported in prepared statement"
    await executeRawDdl('DROP TRIGGER IF EXISTS trg_lost_found_updated_at').catch(() => {});
    await executeRawDdl(`
      CREATE TRIGGER trg_lost_found_updated_at BEFORE UPDATE ON lost_found
        FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP
    `);

    log.INFO('lost_found 表 + 触发器初始化成功（主库 3307）');
  } catch (error) {
    log.ERROR(`lost_found 表初始化失败: ${String(error)}`);
    throw error;
  }
}

/** 复用 analytics/db 的 executeWrite —— 写操作走主库 */
export { executeWrite };

/**
 * 旧名 executeSql（读/写不分），重命名为 executeRead 并指向从库，
 * 保留 executeSql 作为兼容别名（警告式）直到路由层全部迁走
 */
export async function executeReadLostFound<T = import('mysql2/promise').RowDataPacket[]>(
  sql: string,
  params: (string | number | boolean | Date | null)[] = [],
): Promise<T> {
  return executeRead<T>(sql, params);
}

/** 兼容性别名 —— 路由层逐步弃用 */
export const executeSql = executeReadLostFound;

/**
 * 执行"写后回读"查询（UPDATE/INSERT 之后立刻 SELECT 回刚写的数据）→ 强制主库。
 * 普通查询不要用，会给主库加读压力。
 */
export const executeReadAfterWrite = executeReadMaster;
