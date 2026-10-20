/**
 * @file 全局配置
 * @author 第八组
 * @date 2026-10-20
 * @description 端口、前端地址、MySQL 主从库连接配置
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  /** MySQL 读写分离配置：master 负责写，slave 负责读 */
  db: {
    database: process.env.DB_NAME || 'scenic_ai',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    master: {
      host: process.env.DB_MASTER_HOST || '127.0.0.1',
      port: Number(process.env.DB_MASTER_PORT) || 3307,
    },
    slave: {
      host: process.env.DB_SLAVE_HOST || '127.0.0.1',
      port: Number(process.env.DB_SLAVE_PORT) || 3308,
    },
  },
};
