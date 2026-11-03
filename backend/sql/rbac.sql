-- ============================================================================
-- 景区导览 AI 数字人 - RBAC 角色权限建表脚本
-- 第八组（成员C）  2026-10-27
--
-- 设计来源：禅道（ZenTao）权限体系源码分析（easysoft/zentaopms main 分支）
--   zt_group      -> t_role       角色（权限分组）
--   zt_usergroup  -> t_user_role  用户-角色关联（一个用户可挂多个角色，权限取并集）
--   zt_grouppriv  -> t_role_priv  角色-权限点（module:method 粒度，唯一索引去重）
--   zt_acl        -> t_user_acl   对象级访问控制（白名单/黑名单）
-- 简化点：禅道的 vision（多视图）/ project 维度本项目用不到，已裁掉；
--        禅道用 $app->company->admins 字符串存超管，这里改为 t_role.is_admin 短路。
-- ============================================================================

-- 角色表：一个角色 = 一组权限点的集合（对应禅道 zt_group）
CREATE TABLE IF NOT EXISTS t_role (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  code        VARCHAR(32)  NOT NULL                COMMENT '角色编码，程序内引用用，如 admin/operator',
  name        VARCHAR(64)  NOT NULL                COMMENT '角色显示名，如 系统管理员',
  description VARCHAR(255) NOT NULL DEFAULT ''     COMMENT '角色说明',
  is_admin    TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '是否超级管理员：1=拥有全部权限，校验时直接短路（对应禅道 $app->user->admin）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表（对应禅道 zt_group）';

-- 用户-角色关联表：多对多，用户权限 = 其所有角色权限的并集（对应禅道 zt_usergroup）
CREATE TABLE IF NOT EXISTS t_user_role (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account    VARCHAR(64)     NOT NULL COMMENT '用户账号（登录体系未建，当前与前端 x-account 头一致）',
  role_id    BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- 同禅道 zt_usergroup 的 UNIQUE(account, `group`)：防重复授权
  UNIQUE KEY uk_account_role (account, role_id),
  KEY idx_role (role_id),
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES t_role (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联（对应禅道 zt_usergroup）';

-- 角色-权限点表：权限粒度为 module:method（对应禅道 zt_grouppriv）
-- 例：module='kb', method='upload' 表示「知识库-上传文档」
CREATE TABLE IF NOT EXISTS t_role_priv (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id    BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  module     VARCHAR(64)     NOT NULL COMMENT '模块名，与后端路由模块一致：chat/kb/analytics/asr-tts/auth',
  method     VARCHAR(64)     NOT NULL COMMENT '操作名，如 read/upload/delete；* 表示该模块全部操作',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- 同禅道 zt_grouppriv 的 UNIQUE(`group`, module, method)：同一角色同一权限点只存一行
  UNIQUE KEY uk_role_module_method (role_id, module, method),
  CONSTRAINT fk_role_priv_role FOREIGN KEY (role_id) REFERENCES t_role (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限点（对应禅道 zt_grouppriv）';

-- 对象级 ACL：控制某用户对某具体数据对象的访问（对应禅道 zt_acl）
-- 典型场景：知识库某文档仅指定账号可见
CREATE TABLE IF NOT EXISTS t_user_acl (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account     VARCHAR(64)     NOT NULL                    COMMENT '用户账号',
  object_type VARCHAR(32)     NOT NULL                    COMMENT '对象类型，如 kb_document',
  object_id   VARCHAR(64)     NOT NULL                    COMMENT '对象ID（用字符串兼容业务方的主键类型）',
  acl_type    ENUM('whitelist','blacklist') NOT NULL DEFAULT 'whitelist' COMMENT '白名单=仅名单内可见；黑名单=名单内不可见（对应禅道 zt_acl.type）',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_account_object (account, object_type, object_id),
  KEY idx_object (object_type, object_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对象级访问控制（对应禅道 zt_acl）';

-- ============================================================================
-- 种子数据：三个内置角色
--   admin    系统管理员（is_admin=1 短路，无需逐条配权限，同禅道超管）
--   operator 景区运营：管理知识库文档 + 查看数据看板
--   viewer   只读用户：只能看数据看板和知识库
-- ============================================================================
INSERT INTO t_role (code, name, description, is_admin) VALUES
  ('admin',    '系统管理员', '拥有全部权限，校验短路', 1),
  ('operator', '景区运营',   '知识库文档维护与数据查看', 0),
  ('viewer',   '只读用户',   '仅查看数据看板与知识库', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 权限点种子（admin 不插行：is_admin 短路即可，避免权限点清单与代码漂移）
INSERT INTO t_role_priv (role_id, module, method)
SELECT r.id, p.module, p.method
FROM t_role r
JOIN (
  SELECT 'operator' AS code, 'kb'        AS module, 'read'   AS method
  UNION ALL SELECT 'operator', 'kb',        'upload'
  UNION ALL SELECT 'operator', 'kb',        'delete'
  UNION ALL SELECT 'operator', 'analytics', 'view'
  UNION ALL SELECT 'viewer',   'analytics', 'view'
  UNION ALL SELECT 'viewer',   'kb',        'read'
) p ON p.code = r.code
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
