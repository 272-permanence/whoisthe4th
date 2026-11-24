# 景区导览 AI 数字人 · 项目完整简介

> **文档版本**：v1.0  ·  **生成日期**：2026-11-24  ·  **对应代码分支**：main
> 本文档面向任何需要在 5 分钟内搞懂「这个项目到底在干啥、怎么跑、有哪些功能」的读者。所有信息均以仓库代码为唯一依据，不含未来规划或愿景类内容。

---

## 0. 一句话定位

**西湖景区导览 AI 数字人系统**——面向 C 端游客的智能语音导览 + 面向 B 端运营的后台管理，由 4 名成员（A / B / C / D）协作完成，采用 Node.js + Vue 3 前后端分离架构，集成 DashScope 大模型、RAG 知识库、ASR/TTS 语音交互、Redis Stream 异步削峰、Socket.IO 客服聊天、ECharts 运营大屏等完整链路。

---

## 1. 技术栈总览

| 层级 | 选型 | 版本 / 说明 |
|------|------|-------------|
| 前端框架 | Vue 3 + TypeScript | `<script setup>` 全家桶 |
| 前端构建 | Vite | 开发服务器端口 5173 |
| 路由 | Vue Router 4 | createWebHistory |
| 状态管理 | Pinia | user store 管理登录态 |
| UI 组件 | Vant 4 | 移动端组件库 + 按需自动导入 |
| 可视化 | ECharts 6 | 运营大屏图表 |
| 数字人 | pixi.js + pixi-live2d-display | Live2d Avatar 渲染 |
| 客服聊天 | socket.io-client | namespace `/cs` |
| 后端框架 | Express 4.21（**锁定 4.x，不能升 5**） | SSE 流式处理依赖 4.x |
| 后端语言 | Node.js + TypeScript | ESM `"type": "module"` |
| 后端开发 | tsx watch | 热重载 |
| 大模型 | DashScope（阿里云百炼） | OpenAI 兼容端点 `qwen-plus`，留空时自动降级 mock |
| 向量模型 | BGE-M3（1024 维） | 知识库向量化 |
| 向量库 | 内存向量库（Qdrant 可选） | 进程内默认实现，QDRANT_URL 有值时切换 |
| 语音识别 | ASR Provider（mock 离线桩 / whisper-cli / whisper-api） | 默认 mock，前端可走语音采集链路 |
| 语音合成 | TTS Provider（mock / edge-tts） | 默认 mock，流式输出 SSE |
| 数据库 | MySQL（5.5 / 8.x 均可，推荐 8.x） | 读写分离，主库写 / 从库读（本地单实例时主从同端口） |
| 缓存 / 消息队列 | Redis 7（可选，Redis Stream） | 日志异步落库 + 大屏推送分布式锁 + Pub/Sub |
| 鉴权 | JWT + bcryptjs | 密码哈希、token 签发/校验、账号锁定 |
| RBAC | 禅道风格简化版 | 角色表 + 用户角色关联 + 权限点表 + 对象级 ACL |
| 日志 | Pino（控制台 + JSON 文件）+ MySQL 三表 | 全局 traceId 全链路追踪 |
| 文件上传 | Multer | 图片、音频、PDF/DOCX |
| 部署 | Tomcat 集群 + Nginx | deploy/tomcat-cluster 目录下有脚本 |
| 地图 | 高德地图 API（导航代理由后端转发） | 路线规划接口由后端封装 |

---

## 2. 项目目录结构

```
whoisthe4th/
├── backend/                        # 后端服务（Node.js + Express + TypeScript）
│   ├── src/
│   │   ├── app.ts                  # Express 入口：中间件注册、路由挂载、统一错误处理、服务启动
│   │   ├── config.ts               # 环境变量统一读取（端口、DB、Redis、ASR/TTS、DashScope...）
│   │   ├── analytics/              # 数据分析子模块（成员A）
│   │   │   ├── routes.ts           # 埋点 /stats /stream /audit /behaviors /recommend 共 12+ 接口
│   │   │   ├── db.ts               # MySQL 主从连接池（executeRead 走从 / executeWrite 走主）
│   │   │   ├── sentiment.ts        # 情感分析（lexicon-v1 词典版）
│   │   │   ├── sse-broker.ts       # SSE 客户端管理（分布式广播 + 心跳）
│   │   │   └── __tests__/sentiment.test.ts
│   │   ├── auth/                   # RBAC 权限服务（成员C，禅道风格）
│   │   │   ├── rbacService.ts
│   │   │   └── hasPriv.ts
│   │   ├── common/                 # 通用模块
│   │   │   ├── logger.ts           # Pino 封装
│   │   │   ├── redis.ts            # ioredis 单例 + 订阅客户端
│   │   │   ├── sse.ts              # SSE 工具函数
│   │   │   ├── httpError.ts        # 统一 HttpError
│   │   │   ├── errorCodes.ts       # ErrorCodeEnum
│   │   │   └── constants/errorCodes.ts
│   │   ├── middleware/             # 全局中间件
│   │   │   ├── traceId.ts          # 全链路 traceId（X-Trace-Id 请求头 → 响应头）
│   │   │   ├── auth.ts             # JWT 解析 + requireAuth + requireRole + 账号锁定检查
│   │   │   ├── operationLog.ts     # 自动记录所有 /api/v1/* 请求（跳过登录/日志自身）
│   │   │   └── rateLimit.ts        # IP 限流（登录/验证码等）
│   │   ├── routes/                 # 业务路由（共 19 个路由文件，按成员分工）
│   │   ├── services/               # 业务服务层（auth / kb / asr / tts / chat / log / mail / poi / sso...）
│   │   ├── controllers/            # asrTtsController
│   │   ├── lostFound/db.ts         # 失物招领模块 DB 访问
│   │   ├── utils/                  # mask.ts（脱敏）/ httpError / timing / db
│   │   ├── ws/                     # Socket.IO 客服聊天
│   │   │   ├── index.ts            # namespace /cs，注册/消息/客服接入/离开事件
│   │   │   ├── store.ts            # 在线用户、客服、消息、会话的内存存储
│   │   │   └── types.ts
│   │   └── constants/              # kbConstants.ts 等常量
│   ├── sql/                        # 数据库脚本（按序号递增，禁止修改历史）
│   │   ├── 01_schema_mysql55.sql   # 业务主表（audio_log / asr_result / chat_session / conversation / rag_source / knowledge_doc / chunk_index / interaction_log / sentiment_data / poi / route / route_poi / digital_human_config / admin_user）
│   │   ├── 02_schema_lost_found.sql# lost_found 失物招领表 + 种子数据
│   │   ├── 02_poi_route_seed.sql   # 景点/路线种子数据
│   │   ├── 03_log_schema.sql       # error_log / operation_log / login_log 三张日志表
│   │   ├── 03_seed_home_guide.sql  # 首页/攻略种子数据
│   │   └── rbac.sql                # t_role / t_user_role / t_role_priv / t_user_acl（禅道风格）
│   ├── scripts/                    # 运维/演示脚本
│   │   ├── seed-log-demo.mjs       # 一键灌入日志演示数据
│   │   ├── reset-logs.mjs          # 清空日志
│   │   ├── init_mysql.mjs          # 建库建表
│   │   ├── check_logs.mjs           # 自检
│   │   ├── edge_tts_stream.py      # edge-tts Python 脚本（TTS 真实模式）
│   │   ├── whisper_transcribe.py   # Whisper 离线 ASR
│   │   └── requirements.txt
│   ├── .env.example                # 环境变量模板
│   ├── package.json                # Express 4.21 / tsx / ioredis / mysql2 / pino / socket.io
│   └── tsconfig.json
│
├── frontend/                       # 前端 SPA（Vue 3 + Vite + TypeScript）
│   ├── src/
│   │   ├── main.ts                 # 入口：createApp + Pinia + Router
│   │   ├── App.vue                 # 根组件
│   │   ├── router/index.ts         # 路由表（MobileLayout / AdminLayout / PC 独立页）
│   │   ├── layouts/
│   │   │   └── MobileLayout.vue    # 移动端 TabBar 布局（首页 / AI导览 / 失物招领 / 我的）
│   │   ├── stores/user.ts          # Pinia user store（token / userInfo / role / mockLogin）
│   │   ├── api/                    # 按后端路由分文件封装（axios + VITE_API_BASE_URL）
│   │   ├── common/                 # apiClient / request / audioUtils / constants
│   │   ├── composables/            # useAudioCapture / useTtsStream / useCsSocket
│   │   ├── components/
│   │   │   ├── common/             # Avatar / TtsAudioPlayer
│   │   │   └── interaction/        # Live2dAvatar / ConversationList / VoiceInputButton / TextInputBar
│   │   ├── views/
│   │   │   ├── mobile/             # 移动端页面（HomePage / MobileChat / LostFound* / Guide* / CustomerService / ProfilePage）
│   │   │   ├── admin/              # 后台管理（AdminLayout / AdminDashboard / ContentAdmin / ProductAdmin / KnowledgeBaseAdmin / UserAdmin / CsWorkbench / LogCenter）
│   │   │   ├── Home.vue / QaPanel.vue / InteractionView.vue / Dashboard.vue / Login.vue / PoiList.vue / Navigate.vue
│   │   ├── styles/tokens.css       # 全站设计系统 Token（西湖墨绿 #526F61 + 宣纸暖白 #F7F6F2 + 强制浅色模式 + 通用组件类）
│   │   ├── style.css
│   │   └── types/                  # env.d.ts / interaction.ts
│   ├── .env.development            # VITE_API_BASE_URL=http://localhost:XXXX
│   ├── vite.config.ts              # VantResolver 自动导入 + 代理 /api → 后端
│   └── package.json                # Vue 3 / Vite / Vant / ECharts / socket.io-client / pixi.js
│
├── deploy/tomcat-cluster/          # 部署脚本（Nginx + Tomcat 集群）
├── docs/                           # 项目文档（backend-guide / frontend-guide / 接口文档 / 数据库设计 / 日志系统须知 / 开发规范 / 原型 / 需求规格说明书...）
├── log-tech-analysis/              # 日志系统技术分享材料（HTML + 口播稿 Word）
├── prototype/                      # AI 导游原型 PDF + 截图
├── README.md                       # 项目标识
├── .gitattributes                  # LF 换行符统一
└── .gitignore
```

---

## 3. 架构拓扑图（文本版）

```
                ┌─────────────────────────────────────────────────────┐
                │                    Nginx（反向代理）                  │
                └────────────┬──────────────────────┬────────────────┘
                             │                      │
            ┌────────────────▼────┐         ┌───────▼──────────────────┐
            │  前端 SPA (Vue 3)   │         │     Tomcat 集群（x N）    │
            │  :5173 / CDN 静态   │         │   Express Node.js 实例     │
            └─────────────────────┘         └──┬──┬──┬──┬──┬──┬──┬──┬───┘
                                                │  │  │  │  │  │  │  │
             ┌──────────────────────────────────────────────────────────────────┐
             │                          Express 中间件链（每个请求必过）            │
             │   traceIdMiddleware → authMiddleware → operationLogMiddleware →  │
             │                          业务路由 → errorHandler                    │
             └──┬────────────────────────┬───────────────────────┬──────────────┘
                │                        │                       │
      ┌─────────▼──────┐          ┌──────▼────────┐       ┌──────▼────────┐
      │   MySQL 主库    │          │  MySQL 从库    │       │    Redis      │
      │  scenic_ai      │          │  scenic_ai     │       │  :6379        │
      │  写 / DDL       │          │  读 / 查询     │       │ Stream + Pub  │
      └─────────────────┘          └───────────────┘       └──┬────────┘
                                                               │
                                               ┌───────────────┴───────────────┐
                                               │                               │
                                  ┌────────────▼─────────┐         ┌────────────▼─────────┐
                                  │  DashScope 大模型 API │         │  Qdrant（可选向量库）  │
                                  │  qwen-plus (mock 降级)│         │  默认内存向量库       │
                                  └──────────────────────┘         └──────────────────────┘
```

**模块与链路对应**：
| 链路 | 数据源 | 存储 | 异步机制 |
|------|--------|------|----------|
| 语音导览 | DashScope | chat_session / conversation | —（SSE 流式直接返回） |
| RAG 知识库 | BGE-M3 向量化 | knowledge_doc / chunk_index / 向量库 | — |
| 大屏统计 | interaction_log / sentiment_data / lost_found | MySQL | Redis 分布式锁 + Pub/Sub 广播 |
| 日志审计 | 前端埋点 / 中间件自动采集 | operation_log / error_log / login_log | Redis Stream + XREADGROUP 批量消峰 |
| 客服聊天 | socket.io /cs namespace | **内存**（重启丢失） | — |
| 鉴权 | JWT + bcryptjs | admin_user | — |

---

## 4. 数据库表结构

项目使用 **MySQL 5.5.32** 兼容语法，所有 `created_at` 统一为 `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`，双时间戳表的 `updated_at` 使用 `BEFORE UPDATE` 触发器维护（因 MySQL 5.5 每张表最多一个 TIMESTAMP 自动默认）。

### 4.1 业务主表（01_schema_mysql55.sql · 14 张）

| # | 表名 | 作用 | 关键字段 |
|---|------|------|----------|
| 1 | audio_log | 音频上传日志 | request_id / filename / size_bytes / duration_ms |
| 2 | asr_result | ASR 识别结果 | provider / text / status / error_message |
| 3 | chat_session | 对话会话 | session_id（主键）/ user_id / status(active/closed) |
| 4 | conversation | 对话消息 | session_id / role(user/assistant/system) / content(MEDIUMTEXT) / rag_used |
| 5 | rag_source | RAG 引用来源 | conv_id / doc_name / snippet / score |
| 6 | knowledge_doc | 知识库文档 | document_id（唯一）/ file_name / extension / chunk_count / status(processing/ready/failed) |
| 7 | chunk_index | 文档分块索引 | chunk_id（唯一）/ doc_id / chunk_no / content / vector_id |
| 8 | interaction_log | 交互日志 | user_id / message / response / scenic_spot |
| 9 | sentiment_data | 情感分析结果 | log_id（FK→interaction_log）/ score(0~1) / label(positive/neutral/negative) / model |
| 10 | poi | 景点 | name / category(attraction/facility/landmark/food/other) / longitude / latitude / status |
| 11 | route | 路线 | name / theme / estimated_minutes / status |
| 12 | route_poi | 路线-景点关联 | route_id / poi_id / seq / stay_minutes（联合唯一） |
| 13 | digital_human_config | 数字人配置 | config_key（唯一）/ config_value(TEXT) |
| 14 | admin_user | 管理员 | username（唯一）/ password_hash(bcryptjs) / role(admin/operator) / status |

### 4.2 失物招领（02_schema_lost_found.sql · 1 张）

| 表名 | 作用 | 关键字段 |
|------|------|----------|
| lost_found | 失物招领 | type(lost/found) / category(card/electronics/bag/wallet/other) / status(open/resolved/expired) / user_id |

### 4.3 日志审计（03_log_schema.sql · 3 张）

| 表名 | 作用 | 关键字段 |
|------|------|----------|
| error_log | 错误日志 | trace_id / error_type(business/system/dependency) / error_code / stack / route / service |
| operation_log | 操作日志（**中间件自动写入**） | trace_id / user_id / api_path / http_method / request_params(脱敏JSON) / response_code / duration_ms / ip |
| login_log | 登录日志 | trace_id / username(脱敏) / ip / login_result(success/fail_xxx) / fail_reason |

三张表**均含 trace_id**，可按 `GET /api/v1/logs/trace/:traceId` 串联一次请求的完整链路。

### 4.4 RBAC 权限（rbac.sql · 4 张，禅道风格）

| 表名 | 作用 |
|------|------|
| t_role | 角色（admin/operator/viewer），is_admin=1 短路全部权限 |
| t_user_role | 用户-角色关联（多对多） |
| t_role_priv | 角色-权限点（module:method 粒度，如 kb:upload、analytics:view） |
| t_user_acl | 对象级 ACL（白名单/黑名单，如知识库某文档仅指定账号可见） |

**总计：22 张业务表 + 4 张 RBAC 表 = 26 张表**

---

## 5. 后端接口清单（按成员）

### 成员 A：语音交互 + 数据分析 + 大屏

| 路径前缀 | 接口 | 方法 | 说明 |
|----------|------|------|------|
| /api/v1/chat | /stream | POST | **SSE 流式问答入口**：支持单轮 `{message}` / 多轮 `{messages[]}`，RAG 检索 + DashScope 生成，逐 token 推流；session 持久化 + rag_source 记录 + interaction_log 埋点（mock 降级：DashScope API Key 为空时返回模板回答） |
| /api/v1/analytics | /log | POST | 埋点采集：接收前端上报的 userId / message / response / scenicSpot，情感分析(lexicon-v1) 后写 interaction_log + sentiment_data |
| /api/v1/analytics | /stats | GET | 返回当前统计快照（totalVisits / todayVisits / sentimentDist / hotQuestions TOP10 / hourlyTrend 24h / lostFound 全套 / lfTrend） |
| /api/v1/analytics | /stream | GET | **SSE 实时推送**：每 5 秒 computeStats + broadcast 给所有 SSE 客户端；Redis 可用时走分布式锁 + Pub/Sub，多节点只有 leader 计算 |
| /api/v1/analytics | /audit/login-abnormal | GET | 审计：同一 IP 1 小时内 ≥3 次登录失败 |
| /api/v1/analytics | /audit/sensitive-ops | GET | 审计：管理员删除/修改景点、修改用户/权限 |
| /api/v1/analytics | /behaviors/hot-pois | GET | 行为分析：热门景点 TOP10（按 operation_log 中 poi 访问次数） |
| /api/v1/analytics | /behaviors/path | GET | 行为分析：按 traceId 串联的操作序列；指定 traceId 返回完整步骤，否则返回最近 N 条路径概览 |
| /api/v1/analytics | /behaviors/active-hours | GET | 行为分析：近 7 天活跃时段分布（24 小时柱状图） |
| /api/v1/analytics | /recommend/related-pois | GET | 推荐：「看过这个景点的人还看过」—— 基于相同 traceId 的共访统计 |
| /api/v1/asr-tts | /asr | POST | ASR 语音识别：multipart audio 上传 → provider 识别 → mock 默认返回示例文本 |
| /api/v1/asr-tts | /tts/stream | GET | TTS 流式合成 SSE |
| /api/v1/tts | /stream | GET | TTS 流式合成（新路径） |

### 成员 B：导航代理

| 路径前缀 | 接口 | 方法 | 说明 |
|----------|------|------|------|
| /api/v1/navigation | /route | GET | 高德路径规划代理：接收起点/终点/途经点，转发高德 API 并返回；密钥只在后端，前端不接触 |

### 成员 C：知识库 + 鉴权 + 内容管理 + 商品 + 上传 + 统一身份认证 + SSO

| 路径前缀 | 接口 | 方法 | 说明 |
|----------|------|------|------|
| /api/v1/kb | /documents | POST | **上传文档入库**：multipart file（支持 pdf / docx / txt / md）→ 异步解析/分块/向量化 |
| /api/v1/kb | /tasks/:taskId | GET | 查询入库任务状态（processing/ready/failed） |
| /api/v1/kb | /tasks/:taskId/progress | GET | 入库进度百分比 |
| /api/v1/kb | /documents | GET | 文档清单（分页 + 状态过滤） |
| /api/v1/kb | /documents/:documentId | DELETE | 删除文档 + 关联 chunk_index + 向量库条目 |
| /api/v1/kb | /documents/:documentId/reindex | POST | 重新入库（修改后重建向量） |
| /api/v1/kb | /search | POST | **RAG 检索**：query → 向量化 → 向量库相似度搜索 → 返回 top-k 片段 |
| /api/v1/auth | /login | POST | **密码登录**：图形验证码 + IP 限流 + 账号锁定（5 次错 → 15 分钟锁）+ bcryptjs 校验 + JWT 签发 + login_log 记录 |
| /api/v1/auth | /register | POST | 开放注册（IP 限流） |
| /api/v1/auth | /me | GET | 获取当前用户（**requireAuth**） |
| /api/v1/auth | /lock-debug | GET | 账号锁定调试接口（requireAuth + requireAdmin） |
| /api/v1/auth | /captcha | GET | 图形验证码（限流） |
| /api/v1/auth | /providers | GET | 可用登录通道列表（phone / email / wechat / sso / cert） |
| /api/v1/auth | /email/code | POST | 邮箱验证码发送（nodemailer + SMTP） |
| /api/v1/auth | /email/login | POST | 邮箱验证码登录 |
| /api/v1/auth | /phone/code | POST | 手机验证码发送（阿里云 Dysmsapi） |
| /api/v1/auth | /phone/login | POST | 手机验证码登录 |
| /api/v1/auth | /wechat/qr | POST | 微信扫码登录：生成 sceneId + 二维码 |
| /api/v1/auth | /wechat/qr/:sceneId | GET | 查询扫码状态（poll 轮询） |
| /api/v1/auth | /wechat/qr/:sceneId/mock-scan | POST | mock 扫描（开发演示用） |
| /api/v1/auth | /wechat/qr/:sceneId/mock-confirm | POST | mock 确认登录 |
| /api/v1/auth | /sso/config | GET | SSO 登录配置（ticket 票据地址等） |
| /api/v1/auth | /sso/consume | POST | SSO 票据消费：ticket → 换用户信息 |
| /api/v1/auth | /sso/mock-login | POST | SSO mock 登录（演示用） |
| /api/v1/auth | /cert/login | POST | 证书登录（multipart cert 文件上传） |
| /sso-platform | /login | GET | SSO 模拟平台 HTML 登录页 |
| /sso-platform | /login | POST | SSO 模拟平台登录 → 返回 ticket |
| /sso-platform | /consume | GET | SSO 模拟平台 ticket 消费 |
| /api/v1/content | /:type | GET | 按类型返回内容（轮播/banner/公告/景点文案/路线文案/关于我们） |
| /api/v1/admin/content | / | GET/POST/PUT/DELETE | CMS 内容 CRUD（**requireAuth + requireRole('admin')**） |
| /api/v1/admin/content | /:id/publish | POST | 上下架内容 |
| /api/v1/admin/users | / | GET/POST/PUT/reset-password | 管理员 CRUD（requireAuth + requireAdmin） |
| /api/v1/admin/upload | / | POST | 图片上传 Multer（requireAuth + requireAdmin），上传后可通过 /uploads/xxx 静态访问 |
| /api/v1/products | / | GET/POST/PUT/DELETE | 商品 CRUD（写操作 requireAdmin） |
| /api/v1/products | /:id | GET/PUT/DELETE | 商品详情 / 更新 / 删除 |

### 成员 D：移动端模块 + 日志审计 + 客服聊天

| 路径前缀 | 接口 | 方法 | 说明 |
|----------|------|------|------|
| /api/v1/lost-found | / | GET/POST | 失物招领列表（type/status/category 过滤 + 分页）/ 发布 |
| /api/v1/lost-found | /:id | GET/PUT/PATCH/DELETE | 详情 / 更新 / 标记解决 / 删除 |
| /api/v1/routes | / | GET/POST | 游玩攻略列表（theme 过滤）/ 新建 |
| /api/v1/routes | /:id | GET/PUT/DELETE | 详情 / 更新 / 删除 |
| /api/v1/routes | /:id/steps | PUT | 更新路线景点步骤（route_poi） |
| /api/v1/poi | / | GET/POST | 景点列表（category/status 过滤）/ 新建 |
| /api/v1/poi | /list | GET | 景点列表（简化参数） |
| /api/v1/poi | /:id | GET/PUT/DELETE | 景点详情 / 更新 / 删除 |
| /api/v1/home | / | GET | 首页聚合数据（轮播 / 公告 / 热门景点 / 推荐路线 / 商品推荐） |
| /api/v1/logs | /operation | POST | **前端埋点上报**：resourceId + resourceType + action + pagePath（**免鉴权**，放在 requireAuth 之前注册） |
| /api/v1/logs | /error | POST | **前端错误上报**：errorMessage + stack（免鉴权） |
| /api/v1/logs | /operation | GET | 操作日志查询（分页 + traceId/userId/apiPath/时间范围）**requireAuth + requireRole('admin')** |
| /api/v1/logs | /error | GET | 错误日志查询（分页 + traceId/errorType）**requireAuth + requireRole('admin')** |
| /api/v1/logs | /login | GET | 登录日志查询（分页 + username/loginResult）**requireAuth + requireRole('admin')** |
| /api/v1/logs | /trace/:traceId | GET | **全链路追踪查询**：返回该 traceId 下 operation + error + login 三类记录的聚合 |
| /api/v1/cs | /users | GET | 客服工作台：在线用户列表（unread / servingAgent） |
| /api/v1/cs | /history/:userId | GET | 客服工作台：会话历史消息 |
| /health | / | GET | 健康检查（不记录 operation_log） |

### Socket.IO 客服聊天（namespace `/cs`）

| 客户端事件 | 说明 | 服务器推送事件 | 说明 |
|------------|------|---------------|------|
| cs:register | 注册身份（role=user/agent + nickname + userId + token） | cs:register-ack | 注册结果 + 用户信息 |
| cs:user-send | 用户发消息（content） | cs:new-message | 新消息（广播给对应客服 + 回显自己） |
| cs:agent-send | 客服发消息（content + targetId） | cs:user-online | 新用户上线（推给所有客服） |
| cs:agent-join | 客服接入某个用户 | cs:user-offline | 用户下线 |
| cs:agent-leave | 客服完成服务 | cs:agent-connected | 客服已接入（推给用户） |
| — | — | cs:agent-disconnected | 客服已离开 |
| — | — | cs:user-list | 在线用户列表（推给客服） |
| — | — | cs:error | 错误提示 |

**存储方式**：Socket.IO 所有状态（在线用户、客服、消息、会话）都在 **Node.js 进程内存**中，服务重启即丢失。这是 MVP 设计。

---

## 6. 中间件执行顺序与职责

Express 应用中所有请求**必须经过以下中间件链**，顺序**不能改**（注释里写了原因）：

```
请求 → traceIdMiddleware → authMiddleware → operationLogMiddleware → 业务路由 → errorHandler → 响应
        ↑                    ↑                      ↑                      ↑            ↑
        成员D                成员C                  成员B                   各成员       统一异常处理
        生成/复用 traceId    JWT 解析 / 账号锁定     自动写 operation_log    业务逻辑      errorLogger 落库
        写入响应头            填充 req.user                              跳过登录/日志
                                                                         接口自身
```

| 中间件 | 职责 | 成员 |
|--------|------|------|
| traceIdMiddleware | 从 `X-Trace-Id` 请求头取值 → 校验 → 写入 `req.traceId` + 响应头 `X-Trace-Id`；请求头无值时生成 UUID。全局生效，**最前置** | D |
| authMiddleware | 解析 Authorization: Bearer `<token>` → verifyToken → 检查账号锁定（内存 Map，5 次错 → 15 分钟）→ 检查 admin_user.status=disabled → 填充 `req.user`；无 token 或无效 token **放行**（强制登录由各路由 requireAuth 完成） | C |
| operationLogMiddleware | 监听 `res.on('finish')` → 收集 traceId / userId / apiPath / method / responseCode / duration / ip / userAgent → 合并 query+body+params → **脱敏**（mask.ts）→ Pino 打日志 + 异步写 operation_log。**跳过路径**：/auth/login、/auth/refresh、/auth/register、/logs/*、/health | B |
| errorHandler | 统一捕获 HttpError / MulterError / 其他异常 → logError() 异步写 error_log + Pino 文件日志兜底 → 格式化错误响应返回 | app.ts |

---

## 7. 前端页面清单与功能点

### 7.1 移动端页面（TabBar 嵌套 + 独立页）

| 路由 | 文件 | Tab | 核心功能 |
|------|------|-----|----------|
| /home | mobile/HomePage.vue | ✅ 首页 | Banner 轮播 + 运营统计条 + 6 个快捷入口（AI导览/失物招领/游玩攻略/景点导航/在线客服/我的）+ 商品推荐横滑 + 推荐路线卡片 + 热门景点网格 |
| /interaction | mobile/MobileChat.vue | ✅ AI导览 | **语音采集 → ASR → LLM → TTS 全链路**：VoiceInputButton 长按录音 → MediaRecorder + Web Audio VAD 静音断句 → WAV 编码 → POST /api/v1/asr-tts/asr → POST /api/v1/chat/stream SSE 流式回复 → GET /api/v1/tts/stream TTS 合成 → Live2d Avatar 数字人渲染 → 对话气泡列表 + 快捷问题按钮 |
| /lost-found | mobile/LostFoundList.vue | ✅ 失物招领 | 失物/招领 Tab 切换 + 分类筛选（证件/电子设备/钱包/行李/其他）+ 状态筛选（open/resolved）+ 搜索 + 上拉加载更多 + 标记解决 + 删除 |
| /profile | mobile/ProfilePage.vue | ✅ 我的 | 用户头像昵称 + 角色标签（admin/operator/visitor）+ 我的发布（失物招领列表）+ **后台管理入口**（跳到 /admin）+ 在线客服入口 + 退出登录 + 开发用角色切换按钮（mockLogin） |
| /lost-found/publish | mobile/LostFoundPublish.vue | ❌ 独立 | 失物招领发布表单：类型(lost/found) + 分类 + 标题 + 描述 + 地点 + 联系方式 + 发布人昵称 + 图片上传占位 |
| /routes | mobile/GuideList.vue | ❌ 独立 | 游玩攻略列表，卡片式展示 + theme 标签 |
| /routes/:id | mobile/GuideDetail.vue | ❌ 独立 | 路线详情 + 景点步骤列表 + 预计时长 |
| /cs | mobile/CustomerService.vue | ❌ 独立 | **Socket.IO 匿名连接 /cs** → cs:register(role=user) → 在线消息收发 + 连接状态指示 + 系统通知（客服已接入/已离开）+ 发送输入框 |

### 7.2 PC 端独立页面

| 路由 | 文件 | 核心功能 |
|------|------|----------|
| /qa | QaPanel.vue | PC 版智能问答：文本输入 → POST /api/v1/chat/stream SSE → 逐字显示 + RAG 来源引用 + 多轮会话历史 |
| /interact | InteractionView.vue | PC 版 AI 语音导览：Live2d 数字人 + 语音输入 + TTS 播报（组件复用 InteractionView 系列） |
| /pois | PoiList.vue | 景点列表，分类筛选 + 卡片展示 |
| /navigate | Navigate.vue | **高德 AI 导航**：输入起点/终点 → 后端代理 /api/v1/navigation/route → 地图展示路线 + 距离/时长 + 途经点 |
| /dashboard | Dashboard.vue | **数据运营大屏**：GET /api/v1/analytics/stats + GET /api/v1/analytics/stream SSE 每 5 秒刷新 → ECharts 渲染 **6 个图表**（总服务人次卡 + 情感分布饼图 + 热门问答 TOP10 柱状图 + 24h 趋势折线图 + 失物招领状态分布 + 今日新增） |
| /login | Login.vue | 登录页：图形验证码 + 账号密码 + JWT 登录态存储 + mockLogin 开发切换 + SSO 入口 |
| /sso-callback | Login.vue | SSO 票据回调页面 |

### 7.3 后台管理（AdminLayout 嵌套，**requiresAuth + requiresAdmin**）

| 路由 | 文件 | 核心功能 |
|------|------|----------|
| /admin | AdminDashboard.vue | 控制台：欢迎语 + 总内容数 + 已发布内容 + 商品数 + 最新公告 |
| /admin/content | ContentAdmin.vue | CMS 内容管理：首页轮播 + 公告 + 景点文案 + 路线文案 + 关于我们 + 图片上传 + **POI/路线 CRUD**（合并景点管理与路线管理） |
| /admin/products | ProductAdmin.vue | 商品 CRUD + 图片上传 |
| /admin/kb | KnowledgeBaseAdmin.vue | 知识库管理：上传 PDF/DOCX/TXT/MD → 异步入库进度 → 文档清单 + 状态（processing/ready/failed）+ 搜索测试 + 删除 + 重新入库 |
| /admin/users | UserAdmin.vue | 管理员账号 CRUD + 角色切换（admin/operator）+ 禁用/启用 + 重置密码 |
| /admin/cs | CsWorkbench.vue | **客服工作台**：Socket.IO namespace /cs → 在线用户列表（unread 数 + servingAgent）+ 点击接入 → 会话历史 + 消息收发 + 完成服务 |
| /admin/data-board | Dashboard.vue | 数据看板（复用 PC 端 Dashboard 组件 + SSE 实时刷新） |
| /admin/logs | LogCenter.vue | **日志中心**：三 Tab（操作日志 / 错误日志 / 登录日志）+ 分页 + traceId 筛选 + 时间范围筛选 + 用户 ID 筛选 + 点击 traceId 跳转全链路详情（GET /api/v1/logs/trace/:traceId 聚合展示三类日志） |

### 7.4 全局 UI 组件

| 文件 | 说明 |
|------|------|
| Live2dAvatar.vue | Live2d 数字人渲染（pixi-live2d-display），语音输入时切换动作 |
| ConversationList.vue | 对话气泡列表（user / assistant / system 三种角色） |
| VoiceInputButton.vue | 长按录音按钮 → MediaRecorder 采集 → VAD 静音断句 → 输出 WAV Blob |
| TextInputBar.vue | 文本输入 + 发送按钮（支持回车发送） |
| TtsAudioPlayer.vue | TTS 流式音频播放器（GET /tts/stream → AudioContext 解码播放） |
| Avatar.vue | 用户头像（默认头像 / 可自定义） |

### 7.5 Composables

| 文件 | 说明 |
|------|------|
| useAudioCapture.ts | 基于 MediaRecorder + Web Audio API 的语音采集 hook，带 VAD 静音断句 |
| useTtsStream.ts | TTS 流式播放 hook（GET /tts/stream → fetch ReadableStream → AudioContext 逐块解码播放） |
| useCsSocket.ts | 客服聊天 Socket.IO 连接管理 hook |

---

## 8. 语音交互全链路详解

```
用户长按 VoiceInputButton
    │
    ▼
MediaRecorder 采集麦克风音频
    │
    ▼ Web Audio API 分析音量 → 静音超过阈值 → VAD 自动断句
    │
    ▼ WAV 编码（wavEncoder.ts）
    │
    ▼ POST /api/v1/asr-tts/asr  (multer multipart audio)
    │
    ▼ asrTtsController → services/asrService.ts
    │   ├── ASR_PROVIDER=mock  → 返回 "西湖景区有哪些值得游览的景点？"
    │   ├── ASR_PROVIDER=whisper-cli → 调用本地 whisper_transcribe.py
    │   └── ASR_PROVIDER=whisper-api → 调用远程 Whisper API
    │
    ▼ 识别文本展示到对话气泡（user 角色）
    │
    ▼ POST /api/v1/chat/stream  (SSE)
    │
    ▼ chat.ts → services/ 大模型调用
    │   ├── RAG 检索：kbVectorStore.search(query) → top-k 片段
    │   ├── System Prompt 注入 + 历史 messages 拼接
    │   ├── DashScope OpenAI 兼容端点 /compatible-mode/v1/chat/completions
    │   │   ├── DASHSCOPE_API_KEY 有值 → 真实流式调用
    │   │   └── DASHSCOPE_API_KEY 为空 → mock 降级：逐 token 返回模板回答
    │   ├── 逐 token 推 SSE：event: token / event: done / event: error
    │   └── conversation + rag_source + interaction_log 持久化
    │
    ▼ 前端 SSE EventSource → 逐字显示 + done 事件后启动 TTS
    │
    ▼ GET /api/v1/tts/stream?text=xxx  (SSE 音频流)
    │
    ▼ services/ttsService.ts → mockSpeechSynthesizer.ts（默认）
    │   ├── TTS_PROVIDER=mock → 返回 PCM 静音片段（前端 AudioContext 正常播放）
    │   └── TTS_PROVIDER=edge → 调用 edge_tts_stream.py 返回真实音频
    │
    ▼ TtsAudioPlayer → AudioContext 解码播放 + Live2d Avatar 唇形同步
```

---

## 9. RAG 知识库链路详解

```
管理员上传 PDF/DOCX/TXT/MD  (POST /api/v1/kb/documents)
    │
    ▼ Multer 存文件到磁盘
    │
    ▼ services/kbKnowledgeBaseService.ts.createIngestTask()
    │
    ▼ services/kbDocumentParser.ts.parseDocument()
    │   ├── PDF → pdf-parse
    │   ├── DOCX → mammoth
    │   └── TXT/MD → 直接读取
    │
    ▼ services/kbDocumentParser.ts.splitText()
    │   ├── 按语义段落分块
    │   └── 每块 ≤ KB_CHUNK_MAX_CHARS（常量由 kbConstants.ts 定义）
    │
    ▼ services/kbEmbeddingClient.ts.embedTexts()
    │   ├── EMBEDDING_API_URL 有值 → 调用远程 embedding 服务
    │   └── EMBEDDING_API_URL 为空 → 使用本地 mock 向量
    │
    ▼ services/kbVectorStore.ts
    │   ├── QDRANT_URL 有值 → 写入 Qdrant
    │   └── 默认 → 进程内内存向量库（best-sqlite3 可选增强）
    │
    ▼ knowledge_doc.status: processing → ready
    │
    ▼ 前端轮询 GET /api/v1/kb/tasks/:taskId/progress  (0~100%)
    │
    ▼ chat.ts RAG 检索：
    │   kbVectorStore.search(query_vector, topK=5)
    │   → 取回 chunk_index.content + rag_source 记录
    │   → 拼到 system prompt 里："以下是参考资料，请基于此回答：..."
    │   → 大模型生成回复
```

---

## 10. 日志审计链路详解（traceId 全链路追踪）

```
前端请求 apiClient（axios）
    │
    ├── 请求头带 X-Trace-Id（从 localStorage 取，有则复用，无则首次生成）
    │
    ▼ Express 中间件链
    │
    ├── traceIdMiddleware → 确认 traceId → 写入 req.traceId + 响应头 X-Trace-Id
    ├── authMiddleware → JWT 解析 → req.user
    ├── operationLogMiddleware → res.on('finish') → 自动写 operation_log
    │   ├── mergeQueryBodyParams → maskParams 脱敏（password / token 遮盖）
    │   ├── Pino.info 控制台 + JSON 文件
    │   └── 异步 → saveOperationLog()
    │       ├── Redis 可用 → XADD scenic:log:stream
    │       └── Redis 不可用 → 直写 MySQL operation_log
    │
    ▼ 业务路由执行
    │   ├── auth/login 失败 → login_log 记录（C 在 auth.ts 里单独写）
    │   ├── auth/login 成功 → login_log 记录
    │   └── 任意异常 → errorHandler → logError() → error_log 写入
    │
    ▼ shutdown 时 / 每 N 秒
    │
    ├── logQueueConsumer → XREADGROUP scenic:log:stream → 批量落库
    │   └── ACK 后 Redis Stream 清除消费完成的消息
    │
    ▼ 前端查询 /admin/logs
    │
    ├── GET /api/v1/logs/operation?traceId=&apiPath=&start=&end=
    ├── GET /api/v1/logs/error?traceId=&errorType=
    ├── GET /api/v1/logs/login?username=&loginResult=
    └── GET /api/v1/logs/trace/<traceId> → 聚合三类日志
```

**traceId 传播约定**：
1. 前端 apiClient 从 localStorage.traceId 取值 → 请求头 `X-Trace-Id` 发出
2. 后端 traceIdMiddleware 归一化（校验长度 ≤64、只允许 `[A-Za-z0-9._-]`）→ 非法则生成 UUID
3. 响应头 `X-Trace-Id` 必须被浏览器读到（CORS 配置 `exposedHeaders: ['X-Trace-Id']`）
4. 前端埋点（track.ts）用裸 fetch，**必须手动带 X-Trace-Id 头**（不走 apiClient）

**脱敏规则（mask.ts）**：敏感字段自动遮盖（password / token / authorization / secret / credit_card / email / phone），只保留首尾字符，不可逆。

**Redis Stream 削峰机制**：
- 生产者：所有日志写入操作 `XADD scenic:log:stream`（MAXLEN 限制队列长度）
- 消费者：`XREADGROUP GROUP log-writer` 批量拉取（BLOCK 模式，timeout 0）
- 消费成功后 **ACK**；落库失败时 **故意不 ACK**，避免日志静默丢失
- Redis 不可用时自动降级直写 MySQL，功能完全正常

---

## 11. 大屏统计链路详解（Redis 分布式锁 + Pub/Sub）

```
前端 Dashboard.vue
    │
    ├── 首次加载：GET /api/v1/analytics/stats → 拿到当前快照
    │
    └── 后续：GET /api/v1/analytics/stream (SSE)
            │
            ▼ sseBroker.addClient(clientId, res)
            │
            ▼ 后端 startAnalyticsPush() 启动定时器
            │
            ├── Redis 可用：
            │   ├── 定时 5s → isPushLeader() 竞争分布式锁 SET scenic:stats:pusher PX 15000 NX
            │   ├── 抢到锁的节点执行 computeStats()
            │   ├── computeStats() 内 SQL（全部 executeRead 走从库）：
            │   │   ├── SELECT COUNT(*) FROM interaction_log
            │   │   ├── SELECT COUNT(*) WHERE DATE(created_at) = CURDATE()
            │   │   ├── SELECT label, COUNT(*) FROM sentiment_data GROUP BY label
            │   │   ├── SELECT message, COUNT(*) FROM interaction_log GROUP BY message LIMIT 10
            │   │   ├── SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') ... GROUP BY hour (补全 24 个小时)
            │   │   ├── SELECT status, COUNT(*) FROM lost_found GROUP BY status
            │   │   └── ... 失物招领全套
            │   ├── 结果 JSON → redis.publish('scenic:stats', json)
            │   └── 所有节点 subscribe scenic:stats → broadcast('stats', json) 给本机 SSE 客户端
            │
            └── Redis 不可用：
                └── 定时 5s → 仅当 sseBroker.getClientCount() > 0 时 computeStats() → 本机 broadcast()
```

**分布式锁逻辑**：多 Tomcat 节点部署时，只有一个 leader 节点计算统计并 publish 到 Redis Pub/Sub。其他节点订阅同一 channel 后把统计推给本机 SSE 客户端，避免每个节点各算一份重复推。锁 TTL（15s）> 推送间隔（5s），leader 每轮**续期**锁；锁被抢占时其他节点无法 publish，自然降级为被动接收者。

---

## 12. RBAC 权限体系（禅道风格简化版）

参考禅道（ZenTao）开源权限体系源码，裁剪掉 vision / project 等项目维度，保留角色-权限-ACL 三层。

| 层级 | 表 | 说明 |
|------|----|------|
| 角色 | t_role | code=admin/operator/viewer；is_admin=1 时 **校验短路**（直接返回通过，不查 t_role_priv） |
| 用户-角色 | t_user_role | 多对多；一个用户可挂多个角色，权限取并集 |
| 权限点 | t_role_priv | 粒度为 module:method（如 `kb:upload` / `analytics:view` / `analytics:*`） |
| 对象级 ACL | t_user_acl | 白名单/黑名单控制某用户对某数据对象的访问（如知识库某文档仅指定账号可见） |

**三个内置角色**：
| 角色 | 权限 |
|------|------|
| admin | **全部**（is_admin=1 短路） |
| operator | kb:read / kb:upload / kb:delete / analytics:view |
| viewer | analytics:view / kb:read |

**后端守卫写法**：
```ts
// 全局 JWT 解析（无 token 放行，只填充 req.user）
app.use(authMiddleware);
// 强制登录 + 角色校验（路由内挂载）
router.use(requireAuth, requireRole('admin'));
```

**前端守卫写法**（router/index.ts beforeEach）：
```ts
// 需要登录但没 token → 跳 /login
if (to.meta?.requiresAuth && !userStore.isLoggedIn) next({ name: 'login', query: { redirect: to.fullPath } });
// 需要 admin（或 operator）但角色不符 → 跳 /
if (to.meta?.requiresAdmin && !userStore.isAdmin) next('/');
```

**账号锁定机制**（authMiddleware）：内存 Map 记录每个 username 的连续密码错误次数，达 5 次 → 15 分钟锁定（423 Locked）。

---

## 13. 主题设计规范（西湖墨绿 · 只此青绿）

全站统一设计 Token 定义在 `frontend/src/styles/tokens.css`：

| Token | 值 | 说明 |
|-------|----|------|
| --color-primary | #526F61 | **西湖墨绿**，全站唯一强调色，视觉权重 ≤10% |
| --color-primary-hover | #425C50 | hover 态 |
| --color-primary-soft | #E9EFEA | 浅色底用于文字按钮 hover |
| --color-bg | #F7F6F2 | **宣纸暖白**，页面底色 |
| --color-surface | #FFFFFF | 卡片 / 输入框白底 |
| --color-border | #E8E8E2 | 边框灰 |
| --color-text | #303A35 | 主文字深灰绿 |
| --color-text-2 | #7B827D | 次要文字 |
| --color-text-3 | #A5AAA5 | 占位符 / 标签文字 |
| --color-success | #4E8A68 | 成功绿 |
| --color-warning | #C28C43 | 警告金 |
| --color-danger | #C45F55 | 危险红 |

**字体体系**：
- 无衬线：-apple-system / PingFang SC / Microsoft YaHei
- 衬线（标题）：Noto Serif SC / Source Han Serif SC / Songti SC / SimSun

**间距**：4pt 基线 → 4/8/12/16/24/32/48px 六档
**圆角**：6px / 12px / 999px 三档
**阴影**：sm/md/lg 三档，**卡片默认不用阴影**，只有浮层（弹窗）用

**强制浅色模式兜底**：
```css
@media (prefers-color-scheme: dark) {
  :root { color-scheme: light !important; }
  input, select, textarea {
    background-color: #FFFFFF !important;
    color: #303A35 !important;
    border-color: #E8E8E2 !important;
  }
}
html, body { color-scheme: light; background: #F7F6F2; color: #303A35; }
```

**通用组件类**（tokens.css 末尾）：
- `.btn` → .btn-primary / .btn-secondary / .btn-danger / .btn-text / .btn-danger-text
- `.input` → 40px 高 + 外发光 focus
- `.card` → 1px 边框 + 0 阴影
- `.table` → 表头弱化 + hover 高亮
- `.modal` → 唯一允许用 shadow-lg 的场景
- `.error-bar` / `.empty-state` → 反馈条 / 空状态

---

## 14. 部署架构

```
┌─────────────────────────────────────────────┐
│                  Nginx                      │
│  (deploy/tomcat-cluster/nginx/conf)         │
│  - SSL Termination                          │
│  - Load Balance (round-robin)               │
│  - X-Accel-Buffering: no (SSE 必需)         │
└───────────────┬─────────────────────────────┘
                │
   ┌────────────┴────────────┐
   ▼                         ▼
┌──────────────┐     ┌──────────────┐
│  Tomcat #1   │     │  Tomcat #2   │   ← deploy/tomcat-cluster/start-all.ps1
│  Node.js     │     │  Node.js     │       一键启动脚本
│  Express 4   │     │  Express 4   │
└──────┬───────┘     └──────┬───────┘
       │                    │
   ┌───┴────────────────────┴───┐
   ▼                            ▼
┌──────────┐  Redis 7         ┌──────────────┐
│ MySQL    │  :6379           │ MySQL Slave  │
│ Master   │  Stream + Pub/Sub│              │
│ :3307    │  分布式锁         │ :3307        │
└──────────┘                  └──────────────┘
```

**关键脚本**：
- `deploy/tomcat-cluster/start-all.ps1` — 一键启动所有节点
- `deploy/tomcat-cluster/stop-all.ps1` — 一键停止
- `deploy/tomcat-cluster/nginx/conf/nginx.conf` — Nginx 配置（含 SSE proxy_buffering off）

**本地演示环境配置**：
- 后端端口：8000（被占用时改 `.env` PORT=8020，同步改 `.env.development` VITE_API_BASE_URL）
- 前端端口：5173
- MySQL：localhost:3306（或 3307）
- Redis：可选 localhost:6379（不启动不影响主要功能，日志直写 MySQL）

---

## 15. 运行方式

### 15.1 环境依赖

| 依赖 | 版本 | 必需 | 说明 |
|------|------|------|------|
| Node.js | ≥ 18 | ✅ | 后端运行时 |
| npm | ≥ 9 | ✅ | 包管理器 |
| MySQL | 5.5+ / 8.x（推荐 8.x） | ✅ | 数据持久化 |
| Redis | 7（可选） | ⭕ | 不启动自动降级 |

### 15.2 后端启动

```bash
cd backend
npm install                            # 安装依赖（tsx / express 4.21 / ioredis / pino / mysql2 / socket.io...）
cp .env.example .env                   # 复制环境变量模板
# 编辑 .env：
#   PORT=8000                          # 端口，被占用时改 8020/8010
#   DB_MASTER_HOST=127.0.0.1           # MySQL 地址
#   DB_MASTER_PORT=3306                # MySQL 端口（默认 3307，本地单实例改 3306）
#   DB_USER=root / DB_PASSWORD=        # MySQL 账号密码
#   REDIS_ENABLED=false                # 没装 Redis 就设 false
#   DASHSCOPE_API_KEY=                 # 留空时 chat 自动 mock 降级
npm run dev                            # tsx watch 热重载
# 或 npm run build && npm run start    # 生产模式
```

**首次启动时**后端自动执行：
- `initAnalyticsTables()` → interaction_log / sentiment_data 建表
- `initLostFoundTables()` → lost_found 建表 + 触发器
- `initLogTables()` → error_log / operation_log / login_log 建表
- `admin` / `admin123` 管理员账号自动创建（bcryptjs 哈希）

**手动灌日志演示数据**：
```bash
# 后端必须已启动
node scripts/seed-log-demo.mjs
# 预期：operation=20 条 / error=12 条 / login=5 条，含 traceId 链路串联
```

### 15.3 前端启动

```bash
cd frontend
npm install
# 编辑 .env.development：
#   VITE_API_BASE_URL=http://localhost:8000    # 后端实际端口
npm run dev
# 访问 http://localhost:5173
```

### 15.4 登录与权限

| 账号 | 密码 | 角色 | 权限 |
|------|------|------|------|
| admin | admin123 | admin | 全部 |
| 开发 mockLogin('operator') | — | operator | KB 读写 / 看板查看 |
| 开发 mockLogin('visitor') | — | visitor | 看板查看 |

---

## 16. 环境变量完整清单（.env.example）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8000 | 后端端口 |
| FRONTEND_URL | http://localhost:5173 | 允许跨域的前端地址 |
| DASHSCOPE_API_KEY | 空 | 阿里云百炼 API Key（空时 chat mock 降级） |
| DASHSCOPE_MODEL | qwen-plus | 使用的模型名 |
| ASR_PROVIDER | mock | mock / whisper-api / whisper-cli |
| ASR_LANGUAGE | zh | ASR 语言 |
| ASR_TIMEOUT_MS | 30000 | ASR 超时 |
| ASR_MOCK_TEXT | 西湖景区有哪些值得游览的景点？ | mock 模式返回的固定文本 |
| TTS_PROVIDER | mock | mock / edge |
| TTS_VOICE | zh-CN-XiaoxiaoNeural | TTS 语音 |
| TTS_MOCK_SAMPLE_RATE | 24000 | mock TTS 采样率 |
| QDRANT_URL | 空 | Qdrant 向量库地址（空=进程内内存库） |
| EMBEDDING_API_URL | 空 | Embedding API 地址 |
| EMBEDDING_API_KEY | 空 | Embedding API Key |
| EMBEDDING_MODEL | bge-m3 | 向量模型 |
| EMBEDDING_DIMENSION | 1024 | 向量维度（与 bge-m3 对齐） |
| DB_NAME | scenic_ai | 数据库名 |
| DB_USER | root | 数据库用户 |
| DB_PASSWORD | 空 | 数据库密码 |
| DB_MASTER_HOST | 127.0.0.1 | 主库地址（写/DDL） |
| DB_MASTER_PORT | 3306 | 主库端口（生产默认 3307，本地单实例改 3306） |
| DB_SLAVE_HOST | 127.0.0.1 | 从库地址（读） |
| DB_SLAVE_PORT | 3306 | 从库端口（本地单实例时 = 主库） |
| REDIS_ENABLED | false | 是否启用 Redis |
| REDIS_URL | redis://127.0.0.1:6379 | Redis 地址 |
| REDIS_LOG_STREAM | scenic:log:stream | Redis Stream 名称 |
| REDIS_LOG_GROUP | log-writer | Stream 消费组名 |
| REDIS_STATS_CHANNEL | scenic:stats | Pub/Sub 频道（大屏推送） |
| REDIS_STATS_LOCK_KEY | scenic:stats:pusher | 分布式锁 key |

---

## 17. 四人分工表

| 成员 | 主要负责 | 后端文件 | 前端文件 |
|------|----------|----------|----------|
| **A** | 语音交互 + 数据分析 + 大屏 | analytics/routes.ts、analytics/db.ts、analytics/sentiment.ts、analytics/sse-broker.ts、routes/chat.ts、routes/asrTts.ts、routes/tts.ts、controllers/asrTtsController.ts、services/asrService.ts、services/ttsService.ts、services/mockSpeechSynthesizer.ts、services/audioConverter.ts | QaPanel.vue、InteractionView.vue、Dashboard.vue、PoiList.vue、Navigate.vue |
| **B** | 导航代理 + 中间件 + Pino 日志 | routes/navigation.ts、middleware/operationLog.ts、middleware/rateLimit.ts、utils/mask.ts | vite.config.ts 代理配置 |
| **C** | 知识库 + 鉴权 + 内容管理 + SSO + 设计系统 | routes/kb.ts、routes/auth.ts、routes/unifiedAuth.ts、routes/ssoPlatform.ts、routes/content.ts、routes/adminContent.ts、routes/product.ts、routes/upload.ts、routes/user.ts、middleware/auth.ts、auth/rbacService.ts、auth/hasPriv.ts、services/authService.ts、services/authDb.ts、services/captchaService.ts、services/kbDocumentParser.ts、services/kbEmbeddingClient.ts、services/kbKnowledgeBaseService.ts、services/kbTaskStore.ts、services/kbVectorStore.ts、services/ssoPlatform.ts | tokens.css（设计系统）、Login.vue、AdminLayout.vue、AdminDashboard.vue、ContentAdmin.vue、ProductAdmin.vue、KnowledgeBaseAdmin.vue、UserAdmin.vue、composables/ 系列 |
| **D** | 移动端 + 日志审计 + 客服聊天 + 前端地基 | routes/lostFound.ts、routes/home.ts、routes/guide.ts、routes/poi.ts、routes/logs.ts、routes/cs.ts、middleware/traceId.ts、services/logService.ts、services/logQueue.ts、services/errorLogger.ts、ws/index.ts、ws/store.ts、lostFound/db.ts | router/index.ts（全路由）、stores/user.ts、MobileLayout.vue、HomePage.vue、MobileChat.vue、LostFoundList.vue、LostFoundPublish.vue、GuideList.vue、GuideDetail.vue、CustomerService.vue、ProfilePage.vue、LogCenter.vue、CsWorkbench.vue、Dashboard.vue 日志看板部分 |

---

## 18. 项目特色亮点（可用于答辩 / 比赛）

1. **SSE 三层降级链路**：DashScope API Key 为空 → chat 接口自动 mock 逐 token 输出；Redis 不可用 → 日志直写 MySQL、大屏退化为本机 SSE；MySQL 不可用 → 数据表初始化跳过，服务仍能启动。**任何一层故障都不阻塞其他功能**。
2. **全链路 traceId**：前端 apiClient → 后端 traceIdMiddleware → 三张日志表 → 聚合查询 `/logs/trace/:id`，**一次请求从头到尾的每一步都能串起来**。
3. **MySQL 5.5 兼容**：用 TIMESTAMP + BEFORE UPDATE 触发器替代 DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP，双时间戳表同样支持。
4. **Redis Stream 日志削峰**：XADD 生产 + XREADGROUP 消费 + 落库失败故意不 ACK，避免日志静默丢失；Redis 不可用时无缝降级直写。
5. **大屏分布式锁 + Pub/Sub**：多 Tomcat 节点部署时只有 leader 计算统计，所有节点订阅同一 channel 后推给本机 SSE 客户端，避免重复计算 + 广播。
6. **RBAC 禅道简化版**：角色表 is_admin=1 短路全部权限，多角色取并集，对象级 ACL 白名单/黑名单控制到单文档粒度。
7. **Socket.IO 客服聊天**：namespace `/cs` 隔离，用户/客服注册后各自进专属房间，消息一对一推送 + 广播兜底，客服可接入/释放用户。
8. **前端全站统一设计系统**：西湖墨绿 #526F61 + 宣纸暖白 #F7F6F2，强制浅色模式兜底（@media prefers-color-scheme dark override），通用组件类全在 tokens.css。
9. **ASR/TTS Provider 可插拔**：mock → whisper-cli → whisper-api；mock → edge，改 .env 即切换，不影响其他链路。
10. **Express 4 锁定不升 5**：因为 SSE 流式行为在 Express 5 中有变，所以 package.json 显式锁定 4.21.0，避免意外升级打断大屏/TTS。

---

## 19. 禁止事项（来自项目开发规范）

| 禁止 | 原因 |
|------|------|
| 改 Express 5.x | 5.x 的 SSE res.write 行为变化会打断大屏 / TTS |
| 改 .env.example 的结构 | 新增环境变量必须同步更新 .env.example |
| 提交 .env / .env.local | 已 gitignore，包含真实密钥 |
| 修改 backend/sql/ 下已提交的历史脚本 | 改表结构必须新增序号递增的 .sql 文件 |
| 用整文件覆盖解决 Git 冲突 | 改动他人文件需提前在群内告知，由负责人合并 |
| 把后端 middleware/ 交给 A/B/D 改 | 只有 C 能碰中间件 |
| 把前端 vite.config.ts / .env 提交到远程 | 临时联调用，演示完改回 |
| package-lock.json 非 D 维护 | 其他人不得随意提交，锁版本防依赖漂移 |
| 日志表 DDL 非 D 修改 | log 三张表只能 D 改 |
| 日志查询接口去掉 requireAuth + requireRole('admin') | 普通用户禁止访问 |

---

## 20. 快速定位索引

想找某功能的代码在哪？看这张表：

| 功能 | 后端文件 | 前端文件 |
|------|----------|----------|
| 语音导览全链路 | routes/chat.ts / services/asrService.ts / services/ttsService.ts | MobileChat.vue / useAudioCapture.ts / useTtsStream.ts / Live2dAvatar.vue |
| RAG 知识库入库 | services/kbKnowledgeBaseService.ts / services/kbVectorStore.ts / services/kbDocumentParser.ts | KnowledgeBaseAdmin.vue |
| RAG 检索引用 | routes/chat.ts（调用 kbVectorStore.search） | QaPanel.vue（展示 rag_sources） |
| 大屏统计聚合 | analytics/routes.ts computeStats() | Dashboard.vue |
| SSE 实时推送 | analytics/sse-broker.ts / analytics/routes.ts stream | Dashboard.vue (EventSource) |
| Redis Stream 日志削峰 | services/logQueue.ts / common/redis.ts | — |
| 日志自动采集 | middleware/operationLog.ts | utils/track.ts（前端埋点） |
| 全链路 traceId | middleware/traceId.ts | common/apiClient.ts + utils/track.ts |
| 客服聊天 | ws/index.ts + ws/store.ts | CustomerService.vue + CsWorkbench.vue |
| SSO 模拟平台 | routes/ssoPlatform.ts（/sso-platform/*） | Login.vue sso-callback |
| 6 通道统一登录 | routes/unifiedAuth.ts（captcha / email / phone / wechat / sso / cert） | Login.vue |
| 账号锁定 | middleware/auth.ts（isAccountLocked 内存 Map） | Login.vue（423 状态处理） |
| 商品管理 | routes/product.ts | ProductAdmin.vue |
| CMS 内容 | routes/content.ts + routes/adminContent.ts | ContentAdmin.vue |
| 失物招领 | routes/lostFound.ts | LostFoundList.vue + LostFoundPublish.vue |
| 游玩攻略 | routes/guide.ts | GuideList.vue + GuideDetail.vue |
| 景点/导航 | routes/poi.ts + routes/navigation.ts | PoiList.vue + Navigate.vue |
| 首页聚合 | routes/home.ts | HomePage.vue |
| 运营大屏 SSE | analytics/routes.ts + common/redis.ts | Dashboard.vue |
| 设计系统 Token | — | styles/tokens.css |
| 路由表 | — | router/index.ts |
| Pinia 用户态 | — | stores/user.ts |
| 统一错误处理 | app.ts 末尾 errorHandler | — |
| 优雅关闭 SIGINT/SIGTERM | app.ts shutdown() | — |
| 环境变量读取 | config.ts | .env.development / .env.production |
| 数据库连接池读写分离 | analytics/db.ts executeRead / executeWrite | — |

---

> **本文档已校对至**：main 分支 HEAD（2026-11-24 代码快照）。若仓库后续有改动，请重新生成或手动补充差异部分。
