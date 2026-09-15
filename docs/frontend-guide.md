# 前端脚手架使用规范

> 本文档适用于 `whoisthe4th` 项目前端部分。  
> 最后更新：2026-09-15

---

## 1. 技术栈

- 框架：Vue 3
- 构建工具：Vite
- 语言：TypeScript
- 包管理器：npm
- 路由：Vue Router
- 状态管理：Pinia
- HTTP 请求：Axios / fetch

## 2. 环境要求

- Node.js >= 18
- npm >= 9
- Git
- 推荐编辑器：VSCode

## 3. 快速开始

### 3.1 克隆仓库

```bash
git clone https://github.com/272-permanence/whoisthe4th.git
cd whoisthe4th
```

### 3.2 安装前端依赖

```bash
cd frontend
npm install
```

如果下载慢，可切换国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

### 3.3 启动开发服务器

```bash
npm run dev
```

启动后默认访问：http://localhost:5173

## 4. 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产环境代码 |
| `npm run preview` | 本地预览构建结果 |
| `npm run lint` | 代码检查（如已配置） |
| `npm run format` | 代码格式化（如已配置） |

## 5. 目录结构（参考）

```text
frontend/
├── public/                 # 静态资源，不经过构建
├── src/
│   ├── api/                # 接口请求封装
│   ├── assets/             # 图片、样式等资源
│   ├── components/         # 公共组件
│   ├── composables/        # 组合式函数（Vue 3）
│   ├── router/             # 路由配置
│   ├── stores/             # 状态管理（Pinia）
│   ├── views/              # 页面组件
│   ├── App.vue             # 根组件
│   └── main.ts             # 入口文件
├── .env.development        # 开发环境变量
├── .env.production         # 生产环境变量
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 6. 环境变量

前端环境变量放在 `.env.development`、`.env.production` 中，变量名必须以 `VITE_` 开头。

示例 `.env.development`：

```env
VITE_API_BASE_URL=http://localhost:8000
```

在代码中通过 `import.meta.env.VITE_API_BASE_URL` 读取。

## 7. 前后端联调

- 后端地址：http://localhost:8000
- 前端地址：http://localhost:5173
- 后端已配置 CORS，允许前端跨域访问
- 后端接口前缀：`/api/v1/chat`
- 健康检查接口：`GET /health`

前端请求示例：

```ts
const baseURL = import.meta.env.VITE_API_BASE_URL;
fetch(`${baseURL}/api/v1/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '你好' })
});
```

## 8. 代码规范

### 8.1 命名规范

- 组件文件：大驼峰，如 `UserCard.vue`
- 变量、函数：小驼峰，如 `userName`、`fetchData`
- 常量：全大写下划线，如 `API_TIMEOUT`
- CSS 类名：短横线小写，如 `user-card`

### 8.2 代码风格

- 使用 2 个空格缩进
- 字符串统一使用单引号
- 语句末尾不加分号（根据团队习惯，保持一致即可）
- 组件使用 `<script setup>` 语法（Vue 3）

### 8.3 提交前检查

- 确保 `npm run build` 能通过
- 确保没有 ESLint 错误
- 删除无用 `console.log`

## 9. Git 提交规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

| 类型 | 说明 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复问题 |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响代码逻辑） |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具变动 |

示例：

```bash
git commit -m "feat: 添加景区导览聊天界面"
git commit -m "fix: 修复接口请求跨域问题"
git commit -m "docs: 更新前端使用规范"
```

## 10. 分支管理

- `main`：稳定分支，只允许通过 PR 合并
- `dev`：开发分支，日常开发在此进行
- `feature/xxx`：功能分支，从 `dev` 切出
- `docs/xxx`：文档分支
- `fix/xxx`：修复分支

流程示例：

```bash
git checkout dev
git pull origin dev
git checkout -b feature/chat-ui
# 开发...
git add .
git commit -m "feat: 实现聊天界面"
git push origin feature/chat-ui
```

然后在 GitHub 上发起 Pull Request 合并到 `dev`。

## 11. 常见问题

**Q：`npm install` 很慢或失败？**  
A：切换镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

**Q：前端请求后端失败？**  
A：检查：
1. 后端是否已启动在 `http://localhost:8000`
2. `.env.development` 中 `VITE_API_BASE_URL` 是否正确
3. 浏览器控制台是否有 CORS 错误

**Q：启动时提示端口被占用？**  
A：修改 `vite.config.ts` 中的 `server.port`，或关闭占用 `5173` 端口的程序。

**Q：如何同步最新代码？**  
A：

```bash
git pull origin main
```

如有冲突，先解决冲突再提交。

---

## 12. 附录

- 后端规范文档：`docs/backend-guide.md`（由后端负责人维护）
- 项目根 README：`README.md`

如有疑问，请在项目群或 Issue 中提出。
