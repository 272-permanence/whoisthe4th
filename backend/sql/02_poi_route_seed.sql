-- -----------------------------------------------------------------------------
-- 西湖景点与游览路线初始化数据（成员B · 需求 3.2.2 景区导览与路线推荐）
-- 依赖：01_schema.sql 中的 poi / route / route_poi 三张表
-- 说明：脚本可重复执行。已存在的同名景点/路线会被补齐或更新（例如补全经纬度），
--       不会产生重复数据，也不会删除任何已有内容。
-- 坐标采用高德坐标系（GCJ-02），可直接用于高德地图打点。
-- 执行方式：mysql -u<user> -p -P3307 scenic_ai -e "source 02_poi_route_seed.sql"
-- -----------------------------------------------------------------------------

SET NAMES utf8mb4;

-- ============================ 1. 景点 / POI ============================
DROP TEMPORARY TABLE IF EXISTS poi_seed;
CREATE TEMPORARY TABLE poi_seed (
  name        VARCHAR(128) NOT NULL,
  category    VARCHAR(32)  NOT NULL,
  description TEXT,
  location    VARCHAR(255),
  longitude   DECIMAL(10,6),
  latitude    DECIMAL(10,6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO poi_seed (name, category, description, location, longitude, latitude) VALUES
('断桥残雪', 'landmark', '西湖十景之一，位于白堤东端。冬日雪后桥面雪融一半，远望似断非断，因而得名，也是《白蛇传》中许仙与白娘子相会之地。', '白堤东端，北山街旁', 120.151500, 30.259300),
('白堤', 'landmark', '连接断桥与孤山的长堤，全长约 1 公里，原名白沙堤。唐代白居易任杭州刺史时疏浚西湖留下佳话。', '孤山东侧至断桥', 120.146000, 30.256700),
('平湖秋月', 'landmark', '西湖十景之一，位于孤山南麓。秋夜月色与湖光相映，是赏月的经典位置。', '孤山南麓，白堤西端', 120.145500, 30.251700),
('孤山', 'attraction', '西湖中最大的岛屿，海拔约 38 米，岛上汇集西泠印社、浙江省博物馆等文化景点，被誉为"西湖的明珠"。', '西湖北部湖中', 120.143800, 30.253600),
('西泠印社', 'landmark', '创建于 1904 年，是中国成立最早的金石篆刻学术团体，被誉为"天下第一名社"，社址坐落于孤山之上。', '孤山西麓', 120.144200, 30.253400),
('浙江省博物馆孤山馆区', 'facility', '位于孤山南麓，馆藏以书画、陶瓷、钱币见长，是了解浙江历史文化的重要场所。', '孤山南麓', 120.143000, 30.253000),
('曲院风荷', 'attraction', '西湖十景之一，以夏日荷花与酒坊旧址闻名，园内亭桥错落，是赏荷的最佳去处。', '西湖北岸，苏堤北端', 120.135000, 30.247000),
('苏堤春晓', 'attraction', '西湖十景之首。北宋苏轼疏浚西湖时以淤泥堆筑而成，全长约 2.8 公里，春日桃柳夹岸，景色宜人。', '西湖南北纵贯', 120.139500, 30.240500),
('花港观鱼', 'attraction', '西湖十景之一，位于苏堤南段西侧，以红鱼池与牡丹园著称，可观赏成群锦鲤。', '苏堤南段西侧', 120.137800, 30.233900),
('三潭印月', 'attraction', '西湖十景之一，位于小瀛洲岛南侧湖面。三座石塔围成"品"字，月夜塔中点灯可映出多轮月影。', '小瀛洲岛南侧湖面', 120.141900, 30.240200),
('雷峰塔', 'landmark', '西湖十景"雷峰夕照"所在，始建于五代吴越国，2002 年重建。塔高约 71 米，可俯瞰全湖。', '西湖南岸夕照山', 120.148700, 30.231700),
('南屏晚钟', 'landmark', '西湖十景之一，源自南屏山净慈寺的钟声，傍晚钟鸣回荡山谷，意境悠远。', '西湖南岸南屏山净慈寺', 120.146000, 30.228000),
('柳浪闻莺', 'attraction', '西湖十景之一，位于西湖东岸，柳荫深碧、莺啼婉转，是沿湖散步的好去处。', '西湖东南岸', 120.159000, 30.240000),
('湖滨音乐喷泉', 'facility', '位于湖滨三公园湖面，夜间喷泉配合灯光与音乐表演，是西湖东岸的热门夜游项目。', '湖滨三公园湖面', 120.162000, 30.250000),
('岳王庙', 'landmark', '南宋抗金名将岳飞的纪念庙宇，始建于 1221 年，内有岳飞墓与忠烈祠，是重要的爱国主义教育基地。', '西湖北岸栖霞岭下', 120.133000, 30.251000),
('灵隐寺', 'landmark', '始建于东晋咸和元年（326 年），是杭州最古老的佛教寺院之一，与飞来峰造像共同构成著名景区。', '西湖西北麓飞来峰旁', 120.101000, 30.241000),
('六和塔', 'landmark', '位于钱塘江畔月轮山，始建于北宋开宝三年（970 年），塔高近 60 米，是观赏钱塘江大桥的最佳位置。', '钱塘江畔月轮山', 120.129000, 30.199000),
('中国茶叶博物馆', 'facility', '国家级茶文化专题博物馆，展陈茶史、茶俗与茶具，可体验龙井茶冲泡。', '西湖西南龙井路', 120.118000, 30.235000),
('万松书院', 'landmark', '始建于明弘治十一年，是明清时期杭州规模最大的书院，相传梁山伯与祝英台曾在此同窗。', '西湖东南万松岭', 120.154000, 30.228000),
('河坊街', 'food', '杭州历史街区，保留清末民初建筑风貌，汇集杭帮小吃、老字号与手工艺品，适合傍晚逛吃。', '吴山广场北侧', 120.169000, 30.242000);

-- 同名景点：补齐分类、简介、位置与经纬度
UPDATE poi p JOIN poi_seed s ON p.name = s.name
SET p.category    = s.category,
    p.description = s.description,
    p.location    = s.location,
    p.longitude   = s.longitude,
    p.latitude    = s.latitude,
    p.status      = 1;

-- 不存在的景点：新增
INSERT INTO poi (name, category, description, location, longitude, latitude, status)
SELECT s.name, s.category, s.description, s.location, s.longitude, s.latitude, 1
FROM poi_seed s
WHERE NOT EXISTS (SELECT 1 FROM poi p WHERE p.name = s.name);

-- ============================ 2. 游览路线 ============================
DROP TEMPORARY TABLE IF EXISTS route_seed;
CREATE TEMPORARY TABLE route_seed (
  name              VARCHAR(128) NOT NULL,
  theme             VARCHAR(32)  NOT NULL,
  description       TEXT,
  estimated_minutes INT          NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO route_seed (name, theme, description, estimated_minutes) VALUES
('西湖十景经典线', 'general', '一次走遍西湖十景中最具代表性的八处，从断桥出发沿湖环行，适合首次来杭州的游客。', 240),
('历史文化线', 'history', '串联岳王庙、灵隐寺、西泠印社与省博物馆，重点感受杭州的佛教、金石与南宋历史。', 300),
('西湖漫步休闲线', 'nature', '沿东岸到南岸的轻松步行线，湖滨喷泉、柳浪闻莺、苏堤一路湖景，适合慢节奏游览。', 180),
('亲子研学线', 'family', '以茶文化与自然观察为主，行程宽松、停留时间充足，适合带孩子出行。', 210);

UPDATE route r JOIN route_seed s ON r.name = s.name
SET r.theme = s.theme,
    r.description = s.description,
    r.estimated_minutes = s.estimated_minutes,
    r.status = 1;

INSERT INTO route (name, theme, description, estimated_minutes, status)
SELECT s.name, s.theme, s.description, s.estimated_minutes, 1
FROM route_seed s
WHERE NOT EXISTS (SELECT 1 FROM route r WHERE r.name = s.name);

-- ============================ 3. 路线途经点 ============================
DROP TEMPORARY TABLE IF EXISTS route_poi_seed;
CREATE TEMPORARY TABLE route_poi_seed (
  route_name   VARCHAR(128) NOT NULL,
  poi_name     VARCHAR(128) NOT NULL,
  seq          INT          NOT NULL,
  stay_minutes INT          NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO route_poi_seed (route_name, poi_name, seq, stay_minutes) VALUES
('西湖十景经典线', '断桥残雪', 1, 30),
('西湖十景经典线', '白堤', 2, 30),
('西湖十景经典线', '平湖秋月', 3, 30),
('西湖十景经典线', '曲院风荷', 4, 40),
('西湖十景经典线', '苏堤春晓', 5, 50),
('西湖十景经典线', '花港观鱼', 6, 40),
('西湖十景经典线', '三潭印月', 7, 50),
('西湖十景经典线', '雷峰塔', 8, 40),
('历史文化线', '岳王庙', 1, 50),
('历史文化线', '灵隐寺', 2, 90),
('历史文化线', '西泠印社', 3, 40),
('历史文化线', '浙江省博物馆孤山馆区', 4, 60),
('历史文化线', '雷峰塔', 5, 40),
('历史文化线', '南屏晚钟', 6, 30),
('西湖漫步休闲线', '湖滨音乐喷泉', 1, 20),
('西湖漫步休闲线', '柳浪闻莺', 2, 40),
('西湖漫步休闲线', '花港观鱼', 3, 40),
('西湖漫步休闲线', '苏堤春晓', 4, 50),
('西湖漫步休闲线', '曲院风荷', 5, 30),
('亲子研学线', '中国茶叶博物馆', 1, 60),
('亲子研学线', '花港观鱼', 2, 40),
('亲子研学线', '三潭印月', 3, 50),
('亲子研学线', '雷峰塔', 4, 40),
('亲子研学线', '万松书院', 5, 30);

INSERT INTO route_poi (route_id, poi_id, seq, stay_minutes)
SELECT r.id, p.id, s.seq, s.stay_minutes
FROM route_poi_seed s
JOIN route r ON r.name = s.route_name
JOIN poi p ON p.name = s.poi_name
ON DUPLICATE KEY UPDATE stay_minutes = VALUES(stay_minutes);

DROP TEMPORARY TABLE IF EXISTS poi_seed;
DROP TEMPORARY TABLE IF EXISTS route_seed;
DROP TEMPORARY TABLE IF EXISTS route_poi_seed;
