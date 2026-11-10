-- =============================================================================
-- 日志审计子系统建表脚本（成员D · 数据洞察）
-- 文件：backend/sql/03_log_schema.sql
-- 日期：2026-11-09
--
-- 说明：
--   1. 三张日志表：error_log（错误日志）、operation_log（操作日志）、login_log（登录日志）
--   2. 全链路追踪：三张表均含 trace_id，可按 trace_id 串联一次请求的完整链路
--   3. 幂等：全部 CREATE TABLE IF NOT EXISTS，可重复执行不丢数据
--   4. 索引：trace_id / user_id / created_at 为高频查询字段，均建索引
--   5. 执行：
--        mysql -h127.0.0.1 -P3306 -uroot scenic_ai < backend/sql/03_log_schema.sql
--      后端启动时也会由 src/services/logService.ts 的 initTables() 自动补齐
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. error_log  错误日志
--    记录业务异常、系统异常、依赖异常，供排障与审计
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS error_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '自增主键',
  trace_id    VARCHAR(64)  NOT NULL                                 COMMENT '全链路追踪 ID',
  error_type  VARCHAR(32)  NOT NULL                                 COMMENT '错误类型：business / system / dependency',
  error_code  VARCHAR(64)  DEFAULT NULL                             COMMENT '错误码（来自 ErrorCodeEnum）',
  stack       MEDIUMTEXT   DEFAULT NULL                             COMMENT '错误堆栈',
  route       VARCHAR(255) DEFAULT NULL                             COMMENT '触发错误的路由',
  service     VARCHAR(128) DEFAULT NULL                             COMMENT '触发错误的服务',
  user_id     BIGINT       DEFAULT NULL                             COMMENT '关联用户 ID（可空）',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_error_log_trace_id (trace_id),
  KEY idx_error_log_error_type (error_type),
  KEY idx_error_log_created_at (created_at),
  KEY idx_error_log_user_id (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '错误日志（成员D）';

-- -----------------------------------------------------------------------------
-- 2. operation_log  操作日志
--    记录每次 API 调用（脱敏后的请求参数），供行为分析、审计、推荐
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_log (
  id             BIGINT       NOT NULL AUTO_INCREMENT                COMMENT '自增主键',
  trace_id       VARCHAR(64)  NOT NULL                               COMMENT '全链路追踪 ID',
  user_id        BIGINT       DEFAULT NULL                           COMMENT '用户 ID（未登录可空）',
  api_path       VARCHAR(255) NOT NULL                               COMMENT 'API 路径',
  http_method    VARCHAR(16)  NOT NULL                               COMMENT 'HTTP 方法：GET / POST / PUT / DELETE',
  request_params TEXT         DEFAULT NULL                           COMMENT '脱敏后的请求参数（JSON 字符串）',
  response_code  INT          NOT NULL                               COMMENT 'HTTP 响应状态码',
  duration_ms    INT          DEFAULT NULL                           COMMENT '请求耗时（毫秒）',
  ip             VARCHAR(64)  DEFAULT NULL                           COMMENT '客户端 IP',
  user_agent     VARCHAR(512) DEFAULT NULL                           COMMENT '客户端 User-Agent',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP     COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_operation_log_trace_id (trace_id),
  KEY idx_operation_log_user_id (user_id),
  KEY idx_operation_log_api_path (api_path),
  KEY idx_operation_log_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '操作日志（成员D）';

-- -----------------------------------------------------------------------------
-- 3. login_log  登录日志
--    记录管理员登录成功/失败，供异常登录检测（暴力破解）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_log (
  id            BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '自增主键',
  trace_id      VARCHAR(64)  NOT NULL                                 COMMENT '全链路追踪 ID',
  username      VARCHAR(64)  DEFAULT NULL                             COMMENT '脱敏后的用户名',
  ip            VARCHAR(64)  DEFAULT NULL                             COMMENT '客户端 IP',
  login_result  VARCHAR(32)  NOT NULL                                 COMMENT '登录结果：success / fail_wrong_password / fail_user_not_found / fail_locked',
  fail_reason   VARCHAR(255) DEFAULT NULL                             COMMENT '失败原因（可空）',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_login_log_trace_id (trace_id),
  KEY idx_login_log_username (username),
  KEY idx_login_log_ip (ip),
  KEY idx_login_log_login_result (login_result),
  KEY idx_login_log_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '登录日志（成员D）';
