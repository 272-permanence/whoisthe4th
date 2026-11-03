-- =============================================================================
-- 首页 + 游玩攻略 种子数据（成员D）
-- 文件：backend/sql/03_seed_home_guide.sql
-- 日期：2026-11-03
--
-- 说明：
--   1. 必须在 backend/sql/01_schema.sql 执行完之后再跑（依赖 poi / route / route_poi / digital_human_config 表）
--   2. 幂等：INSERT 使用 INSERT ... ON DUPLICATE KEY UPDATE，可重复执行
--   3. 跑完后，首页的 Banner、快捷入口、热门景点、推荐路线、游玩攻略页全部有真实数据
--   4. 后续修改方式：
--      - 后台管理页面（ContentAdmin.vue）在线改
--      - 或直接改 SQL 再跑一次
--      - 或改数据库对应行
--
--   mysql -h127.0.0.1 -P3307 -uroot scenic_ai < backend/sql/03_seed_home_guide.sql
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. digital_human_config：首页 Banner + 快捷入口（JSON）
-- -----------------------------------------------------------------------------

INSERT INTO digital_human_config (config_key, config_value, description) VALUES
('home_banners', JSON_ARRAY(
  JSON_OBJECT('id', 1, 'title', '欢迎来到西湖景区 AI 导览', 'image', '', 'color', 'linear-gradient(135deg, #1989fa, #4db8ff)'),
  JSON_OBJECT('id', 2, 'title', '智慧导览 · 沉浸式体验',   'image', '', 'color', 'linear-gradient(135deg, #07c160, #65d67c)'),
  JSON_OBJECT('id', 3, 'title', '语音交互 · 数字人陪伴',   'image', '', 'color', 'linear-gradient(135deg, #ff976a, #ffc77a)')
), '首页轮播图（JSON 数组）'),

('home_quick_entries', JSON_ARRAY(
  JSON_OBJECT('icon', 'service-o',  'label', 'AI 导览', 'path', '/interaction',   'color', '#1989fa'),
  JSON_OBJECT('icon', 'location-o', 'label', '景色推荐', 'path', '/poi',          'color', '#07c160'),
  JSON_OBJECT('icon', 'guide-o',    'label', '游玩攻略', 'path', '/routes',       'color', '#ff976a'),
  JSON_OBJECT('icon', 'goods-o',    'label', '失物招领', 'path', '/lost-found',   'color', '#7232dd')
), '首页快捷入口（JSON 数组）')

ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  description  = VALUES(description),
  updated_at   = CURRENT_TIMESTAMP;

-- -----------------------------------------------------------------------------
-- 2. POI（景点/兴趣点）—— 西湖景区 8 个标志性景点
-- -----------------------------------------------------------------------------

INSERT INTO poi (name, category, description, location, status) VALUES
('雷峰塔',   'landmark',  '西湖十景之"雷峰夕照"，始建于吴越国时期，2002 年重建。登塔可俯瞰整个西湖。', '杭州市西湖区南山路 15 号', 1),
('苏堤春晓', 'attraction', '西湖十景之首，苏东坡疏浚西湖时所筑。全长约 2.8 公里，六桥烟柳。',        '杭州市西湖区苏堤', 1),
('白堤断桥', 'attraction', '西湖十景之"断桥残雪"，白娘子与许仙相遇的传说地。',                 '杭州市西湖区白堤东端', 1),
('灵隐寺',   'landmark',  '江南著名古刹，始建于东晋咸和元年（326 年），距今已有近 1700 年历史。', '杭州市西湖区灵隐路法云弄 1 号', 1),
('三潭印月', 'attraction', '西湖十景之一，西湖中最大的岛屿，又名小瀛洲。三座石塔立于水中。',       '杭州市西湖区西湖中央', 1),
('花港观鱼', 'attraction', '西湖十景之一，以鱼池、红鱼、牡丹闻名。公园内有蒋庄、马一浮纪念馆。',   '杭州市西湖区西山路 1 号', 1),
('龙井茶园', 'food',     '西湖龙井原产地，可参观茶园、品茗。每年清明前后是最佳采茶季。',          '杭州市西湖区龙井村', 1),
('宋城景区', 'attraction', '以"给我一天，还你千年"为主题的大型主题公园，宋文化主题。',              '杭州市西湖区之江路 148 号', 1)

ON DUPLICATE KEY UPDATE name = VALUES(name);

-- -----------------------------------------------------------------------------
-- 3. Route（游览路线）—— 3 条主题路线
-- -----------------------------------------------------------------------------

INSERT INTO route (name, theme, description, estimated_minutes, status) VALUES
('历史文化精华线', 'history', '覆盖雷峰塔、苏堤、灵隐寺三大标志性文化景点，适合第一次来西湖的游客。', 180, 1),
('自然风光经典线', 'nature',  '西湖十景中的自然风光精品：苏堤春晓、白堤断桥、三潭印月、花港观鱼。',     240, 1),
('亲子休闲慢游线', 'family',  '轻松不累，兼顾人文与娱乐：雷峰塔登塔 + 花港喂鱼 + 宋城主题公园。',     300, 1)

ON DUPLICATE KEY UPDATE name = VALUES(name);

-- -----------------------------------------------------------------------------
-- 4. route_poi（路线-景点关联 + 顺序 + 停留时长）
-- -----------------------------------------------------------------------------
-- 先清旧数据再插新的（保证幂等）
DELETE FROM route_poi;

-- 路线 1: 历史文化精华线（POI id 分别是雷峰塔=1, 灵隐寺=4, 苏堤=2）
INSERT INTO route_poi (route_id, poi_id, seq, stay_minutes) VALUES
(1, 1, 1, 45),   -- 雷峰塔 45 分钟
(1, 4, 2, 90),   -- 灵隐寺 90 分钟
(1, 2, 3, 45);   -- 苏堤步行 45 分钟

-- 路线 2: 自然风光经典线（白堤=3, 三潭印月=5, 花港观鱼=6, 苏堤=2）
INSERT INTO route_poi (route_id, poi_id, seq, stay_minutes) VALUES
(2, 3, 1, 40),   -- 白堤断桥 40 分钟
(2, 5, 2, 60),   -- 三潭印月（需坐船）60 分钟
(2, 6, 3, 50),   -- 花港观鱼 50 分钟
(2, 2, 4, 50);   -- 苏堤 50 分钟

-- 路线 3: 亲子休闲慢游线（雷峰塔=1, 花港=6, 龙井=7, 宋城=8）
INSERT INTO route_poi (route_id, poi_id, seq, stay_minutes) VALUES
(3, 1, 1, 45),
(3, 6, 2, 60),
(3, 7, 3, 60),
(3, 8, 4, 120);

-- -----------------------------------------------------------------------------
-- 验证（可选）
-- -----------------------------------------------------------------------------
-- SELECT 'digital_human_config' AS t, COUNT(*) AS c FROM digital_human_config WHERE config_key LIKE 'home_%'
-- UNION ALL
-- SELECT 'poi', COUNT(*) FROM poi
-- UNION ALL
-- SELECT 'route', COUNT(*) FROM route
-- UNION ALL
-- SELECT 'route_poi', COUNT(*) FROM route_poi;
