-- ======================================================================
-- 04_product_like.sql
-- 日期：2026-11-25
-- 负责人：D（商品点赞收藏持久化 + 商品表 MySQL 版）
-- 说明：
--   1. MySQL 版 product 表（与成员 C 的 SQLite product 表字段一致）
--      额外加 like_count / favorite_count / sales 字段，用于点赞收藏持久化
--   2. 与 C 的 SQLite product 表并存，home.ts 读取 MySQL 版，product 路由继续读 SQLite
--      后续若要统一数据源，可将 C 的 product.ts 切换到 MySQL
--   3. 本脚本幂等（CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS 风格由 executeRead 的 addColumnIfNotExists 替代）
-- ======================================================================

CREATE TABLE IF NOT EXISTS product (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  description    MEDIUMTEXT    NULL,
  price          DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock          INT UNSIGNED  NOT NULL DEFAULT 0,
  category       VARCHAR(100)  NULL,
  image_url      VARCHAR(500)  NULL,
  like_count     INT UNSIGNED  NOT NULL DEFAULT 0,
  favorite_count INT UNSIGNED  NOT NULL DEFAULT 0,
  sales          INT UNSIGNED  NOT NULL DEFAULT 0,
  status         TINYINT       NOT NULL DEFAULT 1 COMMENT '1=上架 0=下架',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_category (category),
  INDEX idx_product_status (status),
  INDEX idx_product_like (like_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表（首页展示 + 点赞收藏持久化）';


-- =============== 示例商品种子数据（首次启动灌入） ===============
INSERT IGNORE INTO product (id, name, description, price, stock, category, image_url, like_count, favorite_count, sales) VALUES
  (1, '西湖龙井茶叶礼盒', '特级明前龙井 100g 礼盒装，适合伴手礼', 388.00, 200, '特产', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖龙井茶叶礼盒 传统风格 简洁素雅&image_size=square_hd', 42, 18, 76),
  (2, '王星记扇子', '杭州老字号王星记真丝手绘折扇', 128.00, 500, '纪念品', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=王星记扇子 杭州特产 真丝手绘折扇 精致&image_size=square_hd', 23, 11, 132),
  (3, '西湖绸伞', '杭州特色丝绸伞，西湖十景图案', 218.00, 150, '纪念品', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖绸伞 杭州 中国风 江南&image_size=square_hd', 31, 15, 58),
  (4, '张小泉剪刀套装', '百年老字号张小泉家用剪刀四件套', 99.00, 800, '日用品', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=张小泉剪刀 老字号 金属质感 精美包装&image_size=square_hd', 17, 6, 201),
  (5, '龙井茶糕', '龙井绿茶风味传统糕点，伴手礼首选', 58.00, 300, '食品', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=龙井茶糕 绿色 传统糕点 精致&image_size=square_hd', 28, 9, 155),
  (6, '西湖十景明信片', '手绘版西湖十景明信片套装 10张', 38.00, 1000, '文创', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=西湖十景明信片 手绘 文艺 清新&image_size=square_hd', 15, 4, 312);

-- =============== 商品点赞/收藏记录表（防止重复点赞，支持取消） ===============
CREATE TABLE IF NOT EXISTS product_like (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED NOT NULL,
  user_id      VARCHAR(100) NOT NULL DEFAULT 'anonymous',
  action       ENUM('like','favorite') NOT NULL,
  created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_product_user_action (product_id, user_id, action),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品点赞/收藏记录（去重 + 持久化）';
