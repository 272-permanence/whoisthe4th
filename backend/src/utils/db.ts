/**
 * @file MySQL 数据库连接 · 薄封装（成员B 原有单库连接，现已对齐全组读写分离）
 * @author 第八组（成员B）
 * @date 2026-10-20
 * @description 本文件原先独立 mysql.createPool({ DB_HOST:DB_PORT }) 开一个单池，
 *              现在改成直接复用 analytics/db.ts 的 master / slave 两套池 ——
 *                1) 全组只维护两套连接池，避免重复配置与资源浪费
 *                2) conversationStore 里的 INSERT 走 master、SELECT 走 slave
 *                3) 本地未做主从时，.env 把 master/slave 配成同一端口即可降级
 *              保持 getDbPool() / closeDbPool() 签名不变，conversationStore.ts 零改动。
 */

import type mysql from 'mysql2/promise';
import {
  getMasterPool as analyticsGetMasterPool,
  getSlavePool as analyticsGetSlavePool,
  closeDb as closeAnalyticsDb,
} from '../analytics/db.js';

/**
 * 兼容旧代码：默认返回 master pool（写操作 / 不确定时用这个最安全）
 * 内部实际是 analytics/db.ts 的懒加载单例，首次调用时才真正创建连接
 */
export function getDbPool(): mysql.Pool {
  return analyticsGetMasterPool();
}

/** 明确走从库（读操作用这个，减轻主库压力） */
export function getSlavePool(): mysql.Pool {
  return analyticsGetSlavePool();
}

/** 优雅关闭：调用 analytics/db 的关闭逻辑（会同时关 master + slave） */
export async function closeDbPool(): Promise<void> {
  await closeAnalyticsDb();
}
