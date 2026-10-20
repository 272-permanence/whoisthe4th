/**
 * @file MySQL 读写分离连接管理
 * @author 第八组
 * @date 2026-10-20
 * @description 主库连接池负责写操作，从库连接池负责读操作，主从复制由 MySQL 层保证
 */

import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('analytics-db');

/** SQL 参数类型 */
type SqlParam = string | number | boolean | Date | null;

/** 主库连接池（写） */
let masterPool: mysql.Pool | null = null;

/** 从库连接池（读） */
let slavePool: mysql.Pool | null = null;

/**
 * 获取主库连接池（写操作走此连接）
 * @returns 主库连接池
 */
export function getMasterPool(): mysql.Pool {
  if (!masterPool) {
    try {
      masterPool = mysql.createPool({
        host: config.db.master.host,
        port: config.db.master.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4',
      });
      log.INFO(`MySQL 主库连接池创建成功 host=${config.db.master.host} port=${config.db.master.port}`);
    } catch (error) {
      log.ERROR(`MySQL 主库连接池创建失败 port=${config.db.master.port}: ${String(error)}`);
      throw error;
    }
  }
  return masterPool;
}

/**
 * 获取从库连接池（读操作走此连接）
 * @returns 从库连接池
 */
export function getSlavePool(): mysql.Pool {
  if (!slavePool) {
    try {
      slavePool = mysql.createPool({
        host: config.db.slave.host,
        port: config.db.slave.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4',
      });
      log.INFO(`MySQL 从库连接池创建成功 host=${config.db.slave.host} port=${config.db.slave.port}`);
    } catch (error) {
      log.ERROR(`MySQL 从库连接池创建失败 port=${config.db.slave.port}: ${String(error)}`);
      throw error;
    }
  }
  return slavePool;
}

/**
 * 执行写语句（走主库）
 * @param sql SQL 语句（使用 ? 占位符）
 * @param params 参数数组
 * @returns 执行结果
 */
export async function executeWrite<T = mysql.ResultSetHeader>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [result] = await getMasterPool().execute(sql, params);
  return result as T;
}

/**
 * 执行读语句（走从库）
 * @param sql SQL 语句（使用 ? 占位符）
 * @param params 参数数组
 * @returns 查询结果集
 */
export async function executeRead<T = mysql.RowDataPacket[]>(sql: string, params: SqlParam[] = []): Promise<T> {
  const [rows] = await getSlavePool().execute(sql, params);
  return rows as T;
}

/**
 * 初始化本模块的数据表（幂等操作，表已存在则跳过）
 * 定义与全组建表脚本 backend/sql/01_schema.sql 中 D 的两张表保持完全一致，
 * 保证「忘记跑脚本」时后端也能自建表；改结构时两处需同步修改。
 * - interaction_log  埋点采集写入的用户提问与数字人回答
 * - sentiment_data   情感分析结果，与 interaction_log 一对一
 */
export async function initTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS interaction_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        scenic_spot VARCHAR(128),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_interaction_log_created_at (created_at),
        INDEX idx_interaction_log_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='交互日志（成员D）'
    `);

    await executeWrite(`
      CREATE TABLE IF NOT EXISTS sentiment_data (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        log_id BIGINT NOT NULL,
        score DECIMAL(4,2) NOT NULL DEFAULT 0,
        label ENUM('positive', 'neutral', 'negative') NOT NULL DEFAULT 'neutral',
        model VARCHAR(64) NOT NULL DEFAULT 'lexicon-v1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_sentiment_data_log_id (log_id),
        INDEX idx_sentiment_data_label (label),
        INDEX idx_sentiment_data_created_at (created_at),
        CONSTRAINT fk_sentiment_data_interaction_log
          FOREIGN KEY (log_id) REFERENCES interaction_log (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='情感分析结果（成员D）'
    `);

    log.INFO('interaction_log / sentiment_data 表初始化成功');
  } catch (error) {
    log.ERROR(`数据表初始化失败: ${String(error)}`);
    throw error;
  }
}

/**
 * 关闭数据库连接池
 */
export async function closeDb(): Promise<void> {
  if (masterPool) {
    await masterPool.end();
    masterPool = null;
  }
  if (slavePool) {
    await slavePool.end();
    slavePool = null;
  }
  log.INFO('MySQL 连接池已关闭');
}
