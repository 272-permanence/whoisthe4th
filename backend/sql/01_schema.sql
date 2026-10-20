-- =============================================================================
-- 景区导览 AI 数字人 —— 全组数据库建表脚本
-- 文件：backend/sql/01_schema.sql
-- 作者：第八组（成员D · 数据洞察与运营大屏 / 数据库统一负责人）
-- 日期：2026-10-20
--
-- 说明：
--   1. 本脚本是全组全部业务表的唯一定义来源，目标数据库 MySQL 8.0，
--      InnoDB 引擎，utf8mb4 字符集。
--   2. 表归属（与 9.22 任务拆解的分工一致）：
--        成员A 多模态交互：audio_log、asr_result
--        成员B 智能问答　：conversation、rag_source
--        成员C 知识库管理：knowledge_doc、chunk_index
--        成员D 数据洞察　：interaction_log、sentiment_data
--   3. 幂等：全部使用 CREATE TABLE IF NOT EXISTS，可重复执行、不丢数据。
--   4. 表间外键已在脚本中串联，关系图见 docs/db-er-diagram.mermaid。
--   5. 执行方式（任选其一）：
--        命令行：mysql -h127.0.0.1 -P3307 -uroot scenic_ai < backend/sql/01_schema.sql
--        MySQL Workbench：打开本文件后直接执行，可 Reverse Engineer 生成 ER 图
--        后端启动时会由 src/analytics/db.ts 的 initTables() 自动补齐 D 的两张表，
--        但其余 6 张表仍需先执行本脚本
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. audio_log  录音元数据（成员A · 多模态交互引擎）
--    音频上传成功时立即写入一条，供 asr_result 通过 request_id 关联
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audio_log (
  id            BIGINT       NOT NULL AUTO_INCREMENT                COMMENT '自增主键',
  request_id    VARCHAR(64)  NOT NULL                               COMMENT '本次请求唯一标识，与 asr_result.request_id 对应',
  filename      VARCHAR(255) NOT NULL                               COMMENT '原始文件名',
  mime_type     VARCHAR(128) DEFAULT NULL                           COMMENT '音频 MIME 类型',
  size_bytes    BIGINT       DEFAULT NULL                           COMMENT '文件体积（字节）',
  duration_ms   INT          DEFAULT NULL                           COMMENT '音频时长（毫秒）',
  sampling_rate INT          DEFAULT NULL                           COMMENT '采样率（Hz）',
  channels      TINYINT      DEFAULT NULL                           COMMENT '声道数',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP     COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_audio_log_request_id (request_id),
  KEY idx_audio_log_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '录音元数据（成员A）';

-- -----------------------------------------------------------------------------
-- 2. asr_result  语音识别结果（成员A · 多模态交互引擎）
--    字段与原 SQLite 版 backend/data/asr.db 中的表 1:1 对应
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asr_result (
  id            BIGINT      NOT NULL AUTO_INCREMENT                 COMMENT '自增主键',
  request_id    VARCHAR(64) NOT NULL                                COMMENT '本次请求唯一标识',
  audio_log_id  BIGINT      DEFAULT NULL                            COMMENT '关联 audio_log.id，录音信息缺失时可为空',
  provider      VARCHAR(64) NOT NULL                                COMMENT '识别提供方：mock / whisper-api / whisper-cli',
  text          TEXT        DEFAULT NULL                            COMMENT '识别出的文本',
  duration_ms   INT         DEFAULT NULL                            COMMENT '识别耗时（毫秒）',
  status        VARCHAR(16) NOT NULL DEFAULT 'success'              COMMENT '识别状态：success / failed / pending',
  error_message TEXT        DEFAULT NULL                            COMMENT '失败原因',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP      COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_asr_result_request_id (request_id),
  KEY idx_asr_result_created_at (created_at),
  KEY idx_asr_result_provider (provider),
  KEY idx_asr_result_status (status),
  CONSTRAINT fk_asr_result_audio_log
    FOREIGN KEY (audio_log_id) REFERENCES audio_log (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = 'ASR 识别结果（成员A）';

-- -----------------------------------------------------------------------------
-- 3. conversation  对话历史（成员B · 智能问答与讲解）
--    列名与 src/services/conversationStore.ts 中的 INSERT / SELECT 完全一致
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation (
  id         BIGINT      NOT NULL AUTO_INCREMENT                    COMMENT '自增主键，供 rag_source.conv_id 关联',
  session_id VARCHAR(64) NOT NULL                                   COMMENT '会话标识，同一轮多轮对话共用一个',
  role       ENUM('user', 'assistant', 'system') NOT NULL           COMMENT '发言角色：用户 / 数字人 / 系统',
  content    MEDIUMTEXT  NOT NULL                                   COMMENT '消息内容',
  rag_used   TINYINT(1)  NOT NULL DEFAULT 0                         COMMENT '是否走了 RAG 检索：1 是 0 否',
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP         COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_conversation_session_id (session_id, id),
  KEY idx_conversation_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '对话历史（成员B）';

-- -----------------------------------------------------------------------------
-- 4. rag_source  RAG 引用来源（成员B · 智能问答与讲解）
--    列名与 src/services/conversationStore.ts 中的 INSERT 完全一致
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_source (
  id         BIGINT       NOT NULL AUTO_INCREMENT                   COMMENT '自增主键',
  conv_id    BIGINT       NOT NULL                                  COMMENT '关联 conversation.id（数字人的那条回答）',
  doc_name   VARCHAR(255) NOT NULL                                  COMMENT '命中的知识库文档名',
  snippet    TEXT         NOT NULL                                  COMMENT '命中的原文片段',
  score      DECIMAL(5,4) DEFAULT NULL                              COMMENT '相似度得分，取值 0 ~ 1',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP        COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_rag_source_conv_id (conv_id),
  CONSTRAINT fk_rag_source_conversation
    FOREIGN KEY (conv_id) REFERENCES conversation (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = 'RAG 引用来源（成员B）';

-- -----------------------------------------------------------------------------
-- 5. knowledge_doc  知识库文档元数据（成员C · 管理后台与知识库）
--    字段对应 src/services/kbKnowledgeBaseService.ts 的 KbDocument 接口
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_doc (
  id          BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '自增主键，供 chunk_index.doc_id 关联',
  document_id VARCHAR(64)  NOT NULL                                 COMMENT '文档业务标识（UUID），对应 KbDocument.documentId',
  file_name   VARCHAR(255) NOT NULL                                 COMMENT '原始文件名',
  extension   VARCHAR(16)  NOT NULL                                 COMMENT '扩展名，如 pdf / docx / md',
  file_path   VARCHAR(512) NOT NULL                                 COMMENT '解析用的落盘路径',
  size_bytes  BIGINT       NOT NULL DEFAULT 0                       COMMENT '文件体积（字节）',
  char_count  INT          NOT NULL DEFAULT 0                       COMMENT '提取出的字符数',
  page_count  INT          NOT NULL DEFAULT 0                       COMMENT '页数',
  chunk_count INT          NOT NULL DEFAULT 0                       COMMENT '切片数量',
  status      ENUM('processing', 'ready', 'failed') NOT NULL
              DEFAULT 'processing'                                  COMMENT '入库状态',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP                           COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_doc_document_id (document_id),
  KEY idx_knowledge_doc_status (status),
  KEY idx_knowledge_doc_created_at (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '知识库文档元数据（成员C）';

-- -----------------------------------------------------------------------------
-- 6. chunk_index  文档切片索引（成员C · 管理后台与知识库）
--    只存切片文本与索引关系；向量本体写在向量库（Qdrant / 内存实现）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunk_index (
  id         BIGINT       NOT NULL AUTO_INCREMENT                   COMMENT '自增主键',
  chunk_id   VARCHAR(128) NOT NULL                                  COMMENT '知识块业务标识，形如 <documentId>-<序号>',
  doc_id     BIGINT       NOT NULL                                  COMMENT '关联 knowledge_doc.id',
  chunk_no   INT          NOT NULL                                  COMMENT '该文档内的切片序号，从 0 开始',
  content    MEDIUMTEXT   NOT NULL                                  COMMENT '切片文本（KbChunkRecord.text）',
  char_count INT          NOT NULL DEFAULT 0                        COMMENT '切片字符数',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP        COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_chunk_index_chunk_id (chunk_id),
  KEY idx_chunk_index_doc_id (doc_id, chunk_no),
  CONSTRAINT fk_chunk_index_document
    FOREIGN KEY (doc_id) REFERENCES knowledge_doc (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '文档切片索引（成员C）';

-- -----------------------------------------------------------------------------
-- 7. interaction_log  交互日志（成员D · 数据洞察与运营大屏）
--    埋点写入走主库，大屏统计读走从库
--    注意：情感分值不再冗余在本表，已拆到 sentiment_data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interaction_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '自增主键',
  user_id     VARCHAR(64)  NOT NULL                                 COMMENT '用户标识',
  message     TEXT         NOT NULL                                 COMMENT '用户提问原文',
  response    TEXT         DEFAULT NULL                             COMMENT '数字人回答',
  scenic_spot VARCHAR(128) DEFAULT NULL                             COMMENT '所属景区 / 景点',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_interaction_log_created_at (created_at),
  KEY idx_interaction_log_user_id (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '交互日志（成员D）';

-- -----------------------------------------------------------------------------
-- 8. sentiment_data  情感分析结果（成员D · 数据洞察与运营大屏）
--    与 interaction_log 一对一，由 src/analytics/sentiment.ts 产出
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sentiment_data (
  id         BIGINT        NOT NULL AUTO_INCREMENT                  COMMENT '自增主键',
  log_id     BIGINT        NOT NULL                                 COMMENT '关联 interaction_log.id，一对一',
  score      DECIMAL(4,2)  NOT NULL DEFAULT 0                       COMMENT '情感得分，范围 -1.00 ~ 1.00',
  label      ENUM('positive', 'neutral', 'negative') NOT NULL
             DEFAULT 'neutral'                                      COMMENT '情感标签',
  model      VARCHAR(64)   NOT NULL DEFAULT 'lexicon-v1'            COMMENT '产出该结果的分析方案',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP       COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sentiment_data_log_id (log_id),
  KEY idx_sentiment_data_label (label),
  KEY idx_sentiment_data_created_at (created_at),
  CONSTRAINT fk_sentiment_data_interaction_log
    FOREIGN KEY (log_id) REFERENCES interaction_log (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '情感分析结果（成员D）';

-- -----------------------------------------------------------------------------
-- 建表结果自检（可选）：应返回 8 行
-- -----------------------------------------------------------------------------
-- SELECT table_name, table_comment FROM information_schema.tables
--   WHERE table_schema = 'scenic_ai' ORDER BY table_name;
