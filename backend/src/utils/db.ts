/**
 * @file MySQL 数据库连接管理
 * @author 第八组（成员B）
 * @date 2026-10-20
 * @description 使用 mysql2 连接 MySQL 8.0，提供连接池单例。
 *              未配置 DB_HOST 时连接自动降级，chat 路由里用 try/catch 包裹不会崩。
 */

import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { config } from '../config.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('mysql');

let pool: Pool | null = null;

/**
 * 获取 MySQL 连接池（懒初始化）
 * @returns mysql2 Pool 实例
 * @throws 当 DB_HOST 未配置或连接失败时抛出
 */
export function getDbPool(): Pool {
  if (!pool) {
    const { host, port, user, password, database } = config.mysql;
    if (!host || host === 'localhost-unconfigured') {
      throw new Error('MySQL 未配置，请在 .env 中设置 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME');
    }

    const options: PoolOptions = {
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      // MySQL 8 默认 caching_sha2_password，mysql2 能自动处理
    };

    pool = mysql.createPool(options);
    log.INFO(`连接池已创建 ${host}:${port}/${database}`);
  }
  return pool;
}

/** 优雅关闭（进程退出时调用） */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.INFO('连接池已关闭');
  }
}
