-- ============================================================
-- 03_log_schema.sql · 日志系统建表脚本（成员D）
-- 目标库：scenic_ai（MySQL 8.0.12 / 兼容 5.5）
-- 说明：
--   1) operation_log  前端操作埋点（点击、交互）
--   2) error_log      前端 JS 运行时错误上报
--   3) 两张表都以 trace_id 为核心索引，实现「同一用户全链路串联」
--   4) 不使用 JSON 类型 / DATETIME DEFAULT，保持与 01_schema_mysql55.sql 兼容
-- 执行：mysql -h127.0.0.1 -P3307 -uroot scenic_ai < backend/sql/03_log_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS operation_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(64) NOT NULL COMMENT '全链路追踪 ID',
  action VARCHAR(64) NOT NULL COMMENT '动作类型：click / view / submit',
  resource_type VARCHAR(64) NOT NULL COMMENT '资源类型：guide-card / poi-step / interaction',
  resource_id VARCHAR(128) NOT NULL COMMENT '资源 ID，如 guide-card:11',
  page_path VARCHAR(255) DEFAULT NULL COMMENT '发生埋点时的前端路由',
  user_id VARCHAR(64) DEFAULT NULL COMMENT '用户 ID（登录体系落地后回填）',
  client_ts BIGINT DEFAULT NULL COMMENT '前端上报的时间戳（毫秒）',
  extra TEXT COMMENT '额外自定义字段（JSON 字符串）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_operation_log_trace_id (trace_id),
  INDEX idx_operation_log_created_at (created_at),
  INDEX idx_operation_log_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端操作日志（成员D）';

CREATE TABLE IF NOT EXISTS error_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(64) NOT NULL COMMENT '全链路追踪 ID',
  error_name VARCHAR(128) NOT NULL COMMENT '错误类型：Error / TypeError / JSError',
  error_message TEXT NOT NULL COMMENT '错误信息',
  stack_trace TEXT COMMENT '错误堆栈',
  page_path VARCHAR(255) DEFAULT NULL COMMENT '发生错误时的前端路由',
  source VARCHAR(64) DEFAULT NULL COMMENT '捕获来源：window.onerror / vue-errorHandler / unhandledrejection',
  user_id VARCHAR(64) DEFAULT NULL COMMENT '用户 ID（登录体系落地后回填）',
  client_ts BIGINT DEFAULT NULL COMMENT '前端上报的时间戳（毫秒）',
  extra TEXT COMMENT '额外自定义字段（JSON 字符串）',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_error_log_trace_id (trace_id),
  INDEX idx_error_log_created_at (created_at),
  INDEX idx_error_log_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端错误日志（成员D）';
