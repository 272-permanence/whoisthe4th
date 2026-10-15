# 后端开发指南

> 本文档适用于 `whoisthe4th` 项目后端部分。
> 负责人：成员 B（智能问答与讲解）
> 最后更新：2026-10-15

---

## 1. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 语言 | TypeScript + Node.js | 运行时使用 ESM (`"type": "module"`) |
| 框架 | Express 4.21 | 稳定版，SSE 流式处理经过验证 |
| 开发 | tsx watch | 热重载开发体验 |
| 大模型 | DashScope OpenAI 兼容模式 | 端点：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| 后续 | LangChain.js + Milvus/BGE-M3 | RAG 检索增强（待实现） |

## 2. 环境配置

### 2.1 安装

```bash
cd backend
npm install
```

### 2.2 环境变量 `.env`

复制 `.env.example` 为 `.env` 并填入真实值：

```env
PORT=8000
FRONTEND_URL=http://localhost:5173
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_MODEL=qwen-plus
```

| 变量 | 说明 |
|------|------|
| `PORT` | 后端端口，默认 8000 |
| `FRONTEND_URL` | 允许跨域的前端地址 |
| `DASHSCOPE_API_KEY` | 阿里云百炼平台 API Key（必配） |
| `DASHSCOPE_MODEL` | 使用的模型名称，默认 `qwen-plus` |

### 2.3 启动

```bash
npm run dev      # 开发（热重载）
npm run build    # 编译 TypeScript
npm run start    # 生产运行
```

## 3. API 契约（核心）

### 3.1 健康检查

```
GET /health
```

响应：
```json
{ "status": "ok", "message": "景区导览 AI 后端运行中" }
```

### 3.2 SSE 流式问答 ⭐

```
POST /api/v1/chat/stream
Content-Type: application/json
```

#### 入参格式

支持两种格式（兼容单轮和多轮对话）：

**单轮对话**：
```json
{
  "message": "请问西湖有什么历史典故？"
}
```

**多轮对话（推荐）**：
```json
{
  "messages": [
    { "role": "system", "content": "你是景区导览助手" },
    { "role": "user", "content": "西湖十景是哪些？" },
    { "role": "assistant", "content": "西湖十景包括苏堤春晓..." },
    { "role": "user", "content": "苏堤是谁建的？" }
  ]
}
```

#### SSE 响应格式

响应头：
```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

每个 SSE 事件格式（`\n\n` 分隔）：
```
event: <事件类型>
id: <序号>
data: <JSON 载荷>

```

#### 事件类型

| event | 说明 | data 结构 |
|-------|------|-----------|
| `token` | 模型生成的增量 token | `{ "content": "苏" }` |
| `done` | 生成结束 | `{ "fullContent": "完整回答文本" }` |
| `error` | 发生错误 | `{ "message": "错误描述" }` |

#### 示例流

```
event: token
id: 0
data: {"content":"西湖"}

event: token
id: 1
data: {"content":"是杭州"}

...

event: done
id: 42
data: {"fullContent":"西湖是杭州最著名的景区..."}
```

#### 前端重连

- 每个事件都带 `id` 字段（自增序号）
- 前端断线重连时可通过 `Last-Event-ID` 请求头告知服务端从哪里恢复
- 心跳注释行（`: heartbeat\n\n`）每 25 秒发送一次，防止代理/负载均衡器超时断开

## 4. 项目结构

```
backend/
├── src/
│   ├── app.ts              # Express 入口
│   ├── config.ts           # 环境变量配置
│   └── routes/
│       └── chat.ts         # /api/v1/chat/* 路由（当前核心）
├── .env.example            # 环境变量模板
├── package.json
└── tsconfig.json
```

## 5. 注意事项

### 5.1 不要用 Express 5

Express 5 的 Response 行为会导致 SSE 流式写入失败（`res.write` 内容不被发送）。**必须使用 Express 4**。

### 5.2 SSE 关键点

- 设置完整响应头：`text/event-stream` + `no-cache` + `keep-alive` + `X-Accel-Buffering: no`
- 每个事件用 `\n\n` 结尾（**两个换行符**）
- `res.write()` 后不需要手动 flush
- 客户端断开时用 `AbortController` 中断上游请求，防止资源泄漏

### 5.3 与其他成员协作

| 成员 | 协作点 |
|------|--------|
| A（语音交互） | 共用 `/api/v1/chat/stream` 接口，A 用语音 ASR 得到文本后调用 |
| C（知识库） | C 把文档解析写入向量库后，B 的 RAG 检索需能立即召回到新内容（待实现 RAG 后对接） |
| D（数据大屏） | D 需要采集问答日志，B 后端可添加日志接口（后续按需对接） |

## 6. 后续规划

- [ ] 接入向量数据库（Milvus）+ BGE-M3 做 RAG
- [ ] 集成 LangChain.js 编排 RAG 流程
- [ ] 返回引用来源给前端（`{ sources: [{ doc: "西湖志", chunk: 3 }] }`）
- [ ] 添加对话历史持久化
