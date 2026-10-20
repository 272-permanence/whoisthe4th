/**
 * @file MySQL 读写分离连接管理
 * @author 第八组
 * @date 2026-10-20
 * @description 主库连接池负责写操作，从库连接池负责读操作，主从复制由 MySQL 层保证
 */

import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

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
      logger.info('MySQL 主库连接池创建成功', { host: config.db.master.host, port: config.db.master.port });
    } catch (error) {
      logger.error('MySQL 主库连接池创建失败', { port: config.db.master.port }, error);
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
      logger.info('MySQL 从库连接池创建成功', { host: config.db.slave.host, port: config.db.slave.port });
    } catch (error) {
      logger.error('MySQL 从库连接池创建失败', { port: config.db.slave.port }, error);
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
 * 初始化数据表（幂等操作，表已存在则跳过）
 */
export async function initTables(): Promise<void> {
  try {
    await executeWrite(`
      CREATE TABLE IF NOT EXISTS interaction_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        sentiment_score DECIMAL(4,2) DEFAULT 0,
        sentiment_label VARCHAR(16) DEFAULT 'neutral',
        scenic_spot VARCHAR(128),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info('interaction_log 表初始化成功');
  } catch (error) {
    logger.error('interaction_log 表初始化失败', error);
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
  logger.info('MySQL 连接池已关闭');
}
