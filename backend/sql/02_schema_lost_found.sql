-- =============================================================================
-- 失物招领模块（成员D · C端前台门户）
-- 与 backend/sql/01_schema_mysql55.sql 保持一致：MySQL 5.5 兼容风格
--   1) created_at 用 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
--   2) updated_at 用 TIMESTAMP NULL + BEFORE UPDATE 触发器
-- =============================================================================

USE `scenic_ai`;

-- 15. lost_found（失物招领）
DROP TABLE IF EXISTS lost_found;
CREATE TABLE lost_found (
  id BIGINT NOT NULL AUTO_INCREMENT,
  type ENUM('lost','found') NOT NULL COMMENT 'lost=遗失启事, found=招领启事',
  category VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '证件/电子设备/钱包/行李/其他',
  title VARCHAR(128) NOT NULL,
  description TEXT DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL COMMENT '丢失或拾取地点',
  image_url VARCHAR(512) DEFAULT NULL,
  contact VARCHAR(128) DEFAULT NULL COMMENT '联系方式',
  publisher_name VARCHAR(64) DEFAULT NULL COMMENT '发布人昵称',
  user_id VARCHAR(64) DEFAULT NULL COMMENT '发布人系统ID（预留对接 C 的登录）',
  status ENUM('open','resolved','expired') NOT NULL DEFAULT 'open' COMMENT 'open=进行中, resolved=已解决, expired=已过期',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_lost_found_type (type),
  KEY idx_lost_found_status (status),
  KEY idx_lost_found_category (category),
  KEY idx_lost_found_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- BEFORE UPDATE 触发器：维护 updated_at
DROP TRIGGER IF EXISTS trg_lost_found_updated_at;
CREATE TRIGGER trg_lost_found_updated_at BEFORE UPDATE ON lost_found
  FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 示例种子数据（可选，方便前端先跑起来）
-- -----------------------------------------------------------------------------
INSERT INTO lost_found (type, category, title, description, location, contact, publisher_name, status) VALUES
('found', 'card', '在苏堤捡到一张校园卡', '卡面是蓝色的XX大学校园卡，失主请联系', '苏堤南段靠近雷峰塔', '微信:xxx', '小王', 'open'),
('lost', 'electronics', '丢失 AirPods Pro 2', '黑色充电盒，挂了白色保护套，在白堤散步时丢失', '白堤-断桥段', '138****1234', '李同学', 'open'),
('found', 'bag', '在岳庙门口捡到一个双肩包', '灰色耐克双肩包，里面有书本和水杯', '岳王庙正门', '电话:xxx', '张大爷', 'open'),
('lost', 'wallet', '丢失黑色钱包', '黑色短款钱包，内有身份证和现金若干', '音乐喷泉附近', '139****5678', '游客赵', 'open');
