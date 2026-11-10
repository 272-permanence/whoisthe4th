-- =============================================================================
-- 景区导览 AI 数字人 —— 全组数据库建表脚本（MySQL 5.5 兼容版）
-- 与 backend/sql/01_schema.sql 差异：
--   1) 所有 created_at 用 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
--   2) 双时间戳表的 updated_at 用 TIMESTAMP NULL + BEFORE UPDATE 触发器
--      （MySQL 5.5 每张表最多一个 TIMESTAMP 自动默认当前时间）
-- =============================================================================

SET NAMES utf8mb4;
DROP DATABASE IF EXISTS `scenic_ai`;
CREATE DATABASE `scenic_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `scenic_ai`;

-- 1. audio_log
CREATE TABLE audio_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(64) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) DEFAULT NULL,
  size_bytes BIGINT DEFAULT NULL,
  duration_ms INT DEFAULT NULL,
  sampling_rate INT DEFAULT NULL,
  channels TINYINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audio_log_request_id (request_id),
  KEY idx_audio_log_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. asr_result
CREATE TABLE asr_result (
  id BIGINT NOT NULL AUTO_INCREMENT,
  request_id VARCHAR(64) NOT NULL,
  audio_log_id BIGINT DEFAULT NULL,
  provider VARCHAR(64) NOT NULL,
  text TEXT DEFAULT NULL,
  duration_ms INT DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asr_result_request_id (request_id),
  KEY idx_asr_result_created_at (created_at),
  KEY idx_asr_result_provider (provider),
  KEY idx_asr_result_status (status),
  CONSTRAINT fk_asr_result_audio_log FOREIGN KEY (audio_log_id) REFERENCES audio_log(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. chat_session
CREATE TABLE chat_session (
  session_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) DEFAULT NULL,
  status ENUM('active','closed') NOT NULL DEFAULT 'active',
  title VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_chat_session_user_id (user_id),
  KEY idx_chat_session_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. conversation
CREATE TABLE conversation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL,
  role ENUM('user','assistant','system') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  rag_used TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_conversation_session_id (session_id, id),
  KEY idx_conversation_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. rag_source
CREATE TABLE rag_source (
  id BIGINT NOT NULL AUTO_INCREMENT,
  conv_id BIGINT NOT NULL,
  doc_name VARCHAR(255) NOT NULL,
  snippet TEXT NOT NULL,
  score DECIMAL(5,4) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rag_source_conv_id (conv_id),
  CONSTRAINT fk_rag_source_conversation FOREIGN KEY (conv_id) REFERENCES conversation(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. knowledge_doc（双时间戳，updated_at 用触发器）
CREATE TABLE knowledge_doc (
  id BIGINT NOT NULL AUTO_INCREMENT,
  document_id VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  extension VARCHAR(16) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  char_count INT NOT NULL DEFAULT 0,
  page_count INT NOT NULL DEFAULT 0,
  chunk_count INT NOT NULL DEFAULT 0,
  status ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_doc_document_id (document_id),
  KEY idx_knowledge_doc_status (status),
  KEY idx_knowledge_doc_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. chunk_index
CREATE TABLE chunk_index (
  id BIGINT NOT NULL AUTO_INCREMENT,
  chunk_id VARCHAR(128) NOT NULL,
  doc_id BIGINT NOT NULL,
  chunk_no INT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  vector_id VARCHAR(64) NOT NULL DEFAULT '',
  char_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_chunk_index_chunk_id (chunk_id),
  KEY idx_chunk_index_doc_id (doc_id, chunk_no),
  CONSTRAINT fk_chunk_index_document FOREIGN KEY (doc_id) REFERENCES knowledge_doc(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. interaction_log
CREATE TABLE interaction_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  response TEXT DEFAULT NULL,
  scenic_spot VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_interaction_log_created_at (created_at),
  KEY idx_interaction_log_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. sentiment_data
CREATE TABLE sentiment_data (
  id BIGINT NOT NULL AUTO_INCREMENT,
  log_id BIGINT NOT NULL,
  score DECIMAL(4,2) NOT NULL DEFAULT 0,
  label ENUM('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
  model VARCHAR(64) NOT NULL DEFAULT 'lexicon-v1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sentiment_data_log_id (log_id),
  KEY idx_sentiment_data_label (label),
  KEY idx_sentiment_data_created_at (created_at),
  CONSTRAINT fk_sentiment_data_interaction_log FOREIGN KEY (log_id) REFERENCES interaction_log(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. poi（双时间戳）
CREATE TABLE poi (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  category ENUM('attraction','facility','landmark','food','other') NOT NULL DEFAULT 'attraction',
  description TEXT DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL,
  longitude DECIMAL(10,6) DEFAULT NULL,
  latitude DECIMAL(10,6) DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_poi_category (category),
  KEY idx_poi_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. route（双时间戳）
CREATE TABLE route (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  theme VARCHAR(32) NOT NULL DEFAULT 'general',
  description TEXT DEFAULT NULL,
  estimated_minutes INT NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_route_theme (theme),
  KEY idx_route_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. route_poi
CREATE TABLE route_poi (
  id BIGINT NOT NULL AUTO_INCREMENT,
  route_id BIGINT NOT NULL,
  poi_id BIGINT NOT NULL,
  seq INT NOT NULL,
  stay_minutes INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_route_poi_route_seq (route_id, seq),
  UNIQUE KEY uk_route_poi_route_poi (route_id, poi_id),
  KEY idx_route_poi_poi_id (poi_id),
  CONSTRAINT fk_route_poi_route FOREIGN KEY (route_id) REFERENCES route(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_poi_poi FOREIGN KEY (poi_id) REFERENCES poi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. digital_human_config（双时间戳）
CREATE TABLE digital_human_config (
  id BIGINT NOT NULL AUTO_INCREMENT,
  config_key VARCHAR(64) NOT NULL,
  config_value TEXT DEFAULT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_digital_human_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. admin_user（双时间戳）
CREATE TABLE admin_user (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(64) DEFAULT NULL,
  role ENUM('admin','operator') NOT NULL DEFAULT 'admin',
  status TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- BEFORE UPDATE 触发器：维护 updated_at（MySQL 5.5 双 TIMESTAMP 的标准解法）
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_knowledge_doc_updated_at;
CREATE TRIGGER trg_knowledge_doc_updated_at BEFORE UPDATE ON knowledge_doc
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_poi_updated_at;
CREATE TRIGGER trg_poi_updated_at BEFORE UPDATE ON poi
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_route_updated_at;
CREATE TRIGGER trg_route_updated_at BEFORE UPDATE ON route
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_digital_human_config_updated_at;
CREATE TRIGGER trg_digital_human_config_updated_at BEFORE UPDATE ON digital_human_config
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_admin_user_updated_at;
CREATE TRIGGER trg_admin_user_updated_at BEFORE UPDATE ON admin_user
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 自检：应返回 14 行
-- -----------------------------------------------------------------------------
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'scenic_ai' ORDER BY table_name;
