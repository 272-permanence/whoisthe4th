# 成员A · 多模态语音交互引擎 —— 实验指引

> 本文档对应分工中的 **成员A（多模态交互 / 语音识别 / 语音合成 / 口型同步）**。
> 当分工文档与仓库脚手架冲突时，**以仓库为准**：仓库前端为 **Vue 3 + TypeScript**（分工文档若写 React，以仓库的 Vue 为准），
> 后端为 **Node.js + Express + TypeScript**，接口前缀统一 `/api/v1/`。

---

## 一、我在仓库里新增/修改了哪些文件

### 后端 `backend/`

| 文件 | 作用 |
| --- | --- |
| `src/config.ts` | 统一读取环境变量（端口、ASR/TTS 提供方、超时、上限），**修改**：新增 ASR/TTS 语音相关配置 |
| `src/routes/asrTts.ts` | 路由层：`POST /asr`（上传音频）、`GET /tts/stream`（SSE 流式合成） |
| `src/controllers/asrTtsController.ts` | 控制器层：参数校验、错误码转换、SSE 事件下发、断线续传 |
| `src/services/asrService.ts` | 语音识别服务，支持 `mock` / `whisper-api` / `whisper-cli` |
| `src/services/ttsService.ts` | 语音合成服务，支持 `edge`（微软 Edge 在线合成）与 `mock`（离线合成） |
| `src/services/mockSpeechSynthesizer.ts` | 离线模拟合成器：按文本节奏生成类人声波形，供无网络演示 |
| `src/utils/sse.ts` | SSE 通用工具：响应头、事件推送、心跳保活 |
| `src/utils/httpError.ts` | 携带 HTTP 状态码与业务错误码的业务异常 |
| `src/utils/timing.ts` | Promise 化定时器 |
| `src/constants/errorCodes.ts` | 统一错误码常量 |
| `src/app.ts` | **修改**：挂载 `/api/v1/asr-tts` 路由、注册统一错误处理中间件（与队友的 `/api/v1/analytics` 路由并存） |
| `scripts/edge_tts_stream.py` | Edge-TTS 流式合成脚本（音频分片直写 stdout） |
| `scripts/whisper_transcribe.py` | 本地 Whisper 识别脚本（faster-whisper 实现） |
| `scripts/requirements.txt` | Python 语音依赖清单 |
| `backend/package.json` | **修改**：在上游依赖基础上新增 `multer`（音频上传解析），并沿用上游的 `express ^4` |
| `backend/tsconfig.json` | 采用上游已补齐的编译配置（原脚手架该文件为空，会导致 `npm run build` 失败） |
| `backend/.env.example` | **修改**：在上游 DashScope 配置基础上补充语音交互全部环境变量 |
| `backend/.gitignore` | **修改**：在上游忽略规则基础上补充 `.venv/`、`__pycache__/` |

### 前端 `frontend/src/`

| 文件 | 作用 |
| --- | --- |
| `api/asrTts.ts` | 接口封装：上传音频识别、构造 SSE 订阅地址 |
| `composables/useAudioCapture.ts` | 麦克风采集 + Web Audio 实时电平 + **VAD 静音自动断句** |
| `composables/useTtsStream.ts` | 订阅 SSE 流：边收边播（MediaSource）+ **音频振幅驱动口型** + 断线重连续传 |
| `components/interaction/Live2dAvatar.vue` | **Live2D 数字人形象（默认渲染方式）**：运行时加载官方样例模型，把音频振幅写入模型参数 `ParamMouthOpenY` 实现口型同步；加载失败（含超时）时通知父组件降级 |
| `components/interaction/DigitalHumanAvatar.vue` | Canvas 2D 数字人形象（**兜底渲染方式**），口型开合由音频振幅实时驱动 |
| `components/interaction/VoiceInputButton.vue` | 语音输入按钮（含实时电平条与 VAD 状态提示） |
| `components/interaction/TextInputBar.vue` | 文字提问 + 常用问题快捷选项 |
| `components/interaction/ConversationList.vue` | 对话记录展示 |
| `views/InteractionView.vue` | 交互编排页：串起「采集 → 识别 → 回答 → 播报 → 口型」全链路；数字人**优先 Live2D、失败自动降级 Canvas** |
| `frontend/package.json` | **修改**：新增 `pixi.js@^6`（渲染引擎）与 `pixi-live2d-display@^0.4`（Live2D 加载器，MIT 许可） |
| `utils/wavEncoder.ts` | 把浏览器录音统一转成 **16kHz 单声道 16bit WAV** |
| `utils/audioLevel.ts` | RMS 电平计算（VAD 与口型共用） |
| `utils/guideReply.ts` | **成员B 的接入点**（见第四节） |
| `router/index.ts` | **修改**：在上游路由基础上新增 `/interaction` 路由，挂载本交互页 |
| `App.vue` | **修改**：改为上游的 `<router-view />`；页面标题移入交互页内部 |
| `constants/`、`types/`、`style.css`、`index.html`、`.env.development` | 常量、类型、主题与开发环境配置 |

> 说明：`HelloWorld.vue` 已不再被引用，可保留也可删除（不属于本人职责范围，未擅自删除）。
> 交互页已挂到 **`/interaction`** 路由，`/`（Home）与 `/dashboard`（数据大屏）为队友页面，互不影响。

---

## 二、接口约定（供成员B/C/D 对接）

### 1. 语音识别

```
POST /api/v1/asr-tts/asr
Content-Type: multipart/form-data
字段：audio（16kHz 单声道 16bit WAV）

响应：{ "code": 0, "message": "success",
        "data": { "text": "西湖有哪些必看景点", "provider": "whisper-cli", "durationMs": 5654 } }
```

### 2. 语音合成（SSE 流式）

```
GET /api/v1/asr-tts/tts/stream?text=待合成文本&lastSeq=0
Accept: text/event-stream

事件序列：
  event: meta   data: { streamId, text, provider, voice, format, sampleRate }
  event: audio  data: { seq, chunk(base64), byteLength }   ← 可多次，format 为 mp3 或 wav
  event: done   data: { streamId, totalChunks, provider }
  event: error  data: { code, message }
```

- `lastSeq`：断线续传用，表示客户端已收到的最大 `seq`，重连时跳过已收分片。
- 每 15 秒下发一次 SSE 注释心跳，避免中间代理超时断连。

---

## 三、环境准备与启动（Windows）

### 第 1 步：安装 Node 依赖

```powershell
cd backend;  npm install
cd frontend; npm install
```

### 第 2 步：准备 Python 语音运行时（Edge-TTS + 本地 Whisper）

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r scripts\requirements.txt
```

### 第 3 步：配置 `backend/.env`

```powershell
Copy-Item backend\.env.example backend\.env
```

打开 `backend\.env`，把 Python 相关项指向刚创建的虚拟环境（**绝对路径最稳妥**）：

```ini
# 语音合成：edge = 微软 Edge 在线合成（音质自然），mock = 离线模拟合成
TTS_PROVIDER=edge
TTS_PYTHON=C:\Users\你的用户名\...\whoisthe4th\backend\.venv\Scripts\python.exe
TTS_VOICE=zh-CN-XiaoxiaoNeural

# 语音识别：whisper-cli = 本地离线 Whisper；只想先跑通链路可先用 mock
ASR_PROVIDER=whisper-cli
ASR_LANGUAGE=zh
ASR_CLI_BIN=C:\Users\你的用户名\...\whoisthe4th\backend\.venv\Scripts\python.exe
ASR_CLI_ARGS=scripts/whisper_transcribe.py --audio {audio} --model small --language zh

# 国内首次下载 Whisper 模型的镜像
HF_ENDPOINT=https://hf-mirror.com
```

> `--model small` 中文识别更准但首次下载约 500MB；只想快速验证可用 `--model tiny`。

### 第 4 步：启动后端与前端（两个终端）

```powershell
# 终端 1
cd backend;  npm run dev          # http://localhost:8000

# 终端 2
cd frontend; npm run dev          # http://localhost:5173
```

浏览器打开 **http://localhost:5173/interaction**（A 的语音交互页；`/` 与 `/dashboard` 为队友页面）。
**建议用 `localhost` 而不是 `127.0.0.1`**，后端 CORS 白名单默认只放通 `localhost:5173`。

---

## 四、成员B 的接入点（重要）

成员A 只负责「语音进 / 语音出」的通道，**回答内容目前是模板占位**。成员B 接入 RAG + LLM 时，**只需改一个文件**：

[guideReply.ts](file:///C:/Users/%E7%8E%8B%E8%BF%8E/Documents/Trae-CN/temp_20261015_01/whoisthe4th/frontend/src/utils/guideReply.ts)

```ts
// 现在：返回本地模板
export function buildGuideReply(question: string): string { ... }

// 接入后：改为调用成员的问答接口（建议同样用 SSE 流式返回，即可实现「边生成边播报」）
export async function buildGuideReply(question: string): Promise<string> { ... }
```

`InteractionView.vue` 中已把「提问 → 生成回答 → 播报」收敛到 `askQuestion()` 单个函数内，
换成流式回答后，可在每收到一小段文本时就调用 `speak()`，实现 **LLM 流式 + TTS 流式** 的分句播报（当前实现为整句播报）。

> 上游仓库已提供现成的问答流式接口：`POST /api/v1/chat/stream`（DashScope SSE，事件为 `token` / `done` / `error`），
> 需先在 `backend/.env` 配置 `DASHSCOPE_API_KEY`。成员B 接入时把 `buildGuideReply` 改为调用该接口（或自建 RAG 接口）即可，语音链路无需改动。
> 本轮合并**刻意保留**模板占位，避免未配置 API Key 时交互页直接报错。

---

## 五、我实测通过的验证清单

| 验证项 | 命令 / 操作 | 实测结果 |
| --- | --- | --- |
| 后端健康检查 | `curl http://localhost:8000/health` | `{"status":"ok",...}` |
| 真实中文语音识别 | 用 Edge-TTS 合成「西湖有哪些必看景点？」→ POST `/asr` | `provider: whisper-cli`，识别为「喜歡有哪些必看景點」（tiny 模型，用 small 更准） |
| TTS 流式合成 | `curl -N "…/tts/stream?text=…"` | 事件序列 `meta → audio×4 → done`，3.5s 内完成；音频为合法 MP3 帧 |
| 前端构建 | `cd frontend; npm run build` | `vue-tsc` 类型检查 + `vite build` 通过 |
| 前端页面 | 浏览器打开 5173，点击预设问题 | 数字人形象正常渲染，用户/数字人气泡出现，状态显示「正在为你播报…」 |
| 流式播放 + 口型同步 | 前后两次截图对比 | 嘴型随音频振幅实时变化（口型同步生效） |
| Live2D 模型加载 | 打开 `/interaction`，等模型从 CDN 加载完成 | 面板显示「渲染方式：Live2D 模型 · 口型同步」，角色为官方 Hiyori 样例模型，控制台无报错 |
| Live2D 口型同步 | 静止态与播报态各截一张图对比 | 静止时嘴巴闭合为细线、播报时嘴巴张开为明显椭圆（`ParamMouthOpenY` 随振幅变化） |
| Live2D 降级兜底 | 把 `VITE_LIVE2D_MODEL_URL` 指向不可达地址后重开前端 | 自动降级为 Canvas 数字人，面板显示「渲染方式：Canvas 兜底（Network error.）」，播报链路仍正常 |
| 麦克风全链路 | 点击 🎙️ 按钮 | 进入「正在聆听…」录音态 → VAD 自动断句 → 上传识别 → 触发播报 |
| 控制台 | 浏览器 Console | 无报错、无警告 |

---

## 六、Live2D 数字人（口型同步）接入说明

分工「技术栈（必须使用）」要求口型同步使用 **Wav2Lip 或 Live2D**。本实现采用 **Live2D**，
并保留自研 Canvas 数字人作为兜底（模型不可用时自动降级，演示不开天窗）。

### 1. 用的什么模型，从哪来，许可能不能用

| 项 | 说明 |
| --- | --- |
| 模型 | Live2D 官方免费样例 **「桃濑日和」Hiyori**（Cubism 4 格式，`.model3.json`） |
| 来源 | 官方示例仓库 [`Live2D/CubismWebSamples`](https://github.com/Live2D/CubismWebSamples) 的 `Samples/Resources/Hiyori/` |
| 加载方式 | 经 jsDelivr CDN 引用：`https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Hiyori/Hiyori.model3.json` |
| 许可 | Live2D 官方条款**禁止再分发模型素材**，因此**模型文件不进仓库**，只在运行时从 CDN 引用，规避授权风险 |

### 2. 依赖与运行库

| 组件 | 版本 / 地址 | 许可 | 引入方式 |
| --- | --- | --- | --- |
| `pixi-live2d-display` | `^0.4` | MIT（开源） | `npm` 依赖，**按需动态 import** |
| `pixi.js` | `^6`（该加载器仅支持 v6/v7） | MIT（开源） | `npm` 依赖，随上者一起动态 import |
| Live2D Cubism Core | `live2dcubismcore.min.js` | Live2D 闭源专有（Redistributable Code），本场景免费 | **运行时**注入官方 CDN 脚本 `https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js`，同样不进仓库 |

> 运行库与模型地址统一在 [interactionConstants.ts](file:///C:/Users/%E7%8E%8B%E8%BF%9B/Documents/Trae-CN/temp_20261015_01/whoisthe4th/frontend/src/constants/interactionConstants.ts) 维护，**未硬编码到组件中**；也可用环境变量 `VITE_LIVE2D_MODEL_URL` 覆盖。

### 3. 口型是怎么驱动的

沿用现有音频链路，**没有改动任何音频代码**：

```
SSE 音频分片 → HTMLAudioElement 播放 → AnalyserNode 采样
                                            ↓
                            useTtsStream 导出 mouthOpen（0~1 振幅）
                                            ↓
             Live2dAvatar 每帧在 beforeModelUpdate 写入 ParamMouthOpenY
```

- `ParamMouthOpenY` 是 Hiyori `model3.json` 中 `LipSync` 分组声明的口型参数，组件常量 `LIVE2D_MOUTH_PARAM_ID` 与之一致。
- 写入时机选 `internalModel` 的 `beforeModelUpdate` 事件：此时动作、物理、呼吸均已写参完毕、尚未变形，口型不会被覆盖。
- 未说话时强制写 0，保证闭嘴。

### 4. 换成自有模型（可选，无需改代码）

```ini
# frontend/.env.development（或在 .env.local 中覆盖）
VITE_LIVE2D_MODEL_URL=https://你的域名/你的模型/xxx.model3.json
```

模型需为 **Cubism 3/4/5** 格式，且 `model3.json` 中声明了 `LipSync` 分组（`ParamMouthOpenY`）。

---

## 七、降级矩阵（无网络/无麦克风也能演示）

| 场景 | 配置 | 效果 |
| --- | --- | --- |
| 正常联网 | `TTS_PROVIDER=edge` | 微软在线合成，音质自然 |
| 断网 / 无法访问 Edge | `TTS_PROVIDER=edge` 但依赖缺失 → **自动降级**；或直接设 `TTS_PROVIDER=mock` | 后端自动切到离线合成器（输出 WAV），前端按 `meta.format` 自动切换播放格式，**链路不断** |
| 想快速跑通链路 | `ASR_PROVIDER=mock` | 返回固定文本，跳过模型下载 |
| 离线真识别 | `ASR_PROVIDER=whisper-cli` | 本地 Whisper，无需 API Key |
| 有云端算力 | `ASR_PROVIDER=whisper-api` | 填 `WHISPER_API_KEY` 与 `WHISPER_API_URL`（OpenAI 兼容接口，如硅基流动/阿里云百炼） |
| 无法加载 Live2D（断网 / CDN 不可达 / 模型地址错误） | 无需配置，`Live2dAvatar` 加载失败或超时即触发 | **自动降级**为 Canvas 2D 数字人，面板标注降级原因；语音链路完全不受影响 |

---

## 八、常见问题排查

| 现象 | 原因与处理 |
| --- | --- |
| 浏览器打不开 `http://localhost:5173/` | Vite 在 Windows 上可能只绑定了 IPv6。改用 `npm run dev -- --host 127.0.0.1`；此时请用 `http://127.0.0.1:5173/` 访问，并同步把 `.env` 的 `FRONTEND_URL` 改成 `http://127.0.0.1:5173` |
| 前端提示 CORS 错误 | 后端 `.env` 的 `FRONTEND_URL` 必须与浏览器地址栏的 **协议+域名+端口完全一致** |
| 后端启动报 `EADDRINUSE: 8000` | 端口被占用：`Get-NetTCPConnection -LocalPort 8000 -State Listen` 找到进程后 `Stop-Process -Id <PID> -Force` |
| 页面提示「浏览器暂时阻止了语音播放」 | 浏览器自动播放策略限制。**点击页面任意位置**即可继续播放（已做自动重试） |
| 页面提示「无法访问麦克风」 | 浏览器未授权或设备无麦克风。允许麦克风权限；无设备时改用下方文字输入框 |
| 识别一直返回固定文本 | `ASR_PROVIDER` 还是 `mock`，改成 `whisper-cli` |
| 本地识别报 `metadata_errors` | `faster-whisper` 与 `av` 版本不匹配。本仓库的 `whisper_transcribe.py` 已改为**用标准库读取 16kHz WAV 并传 float32 数组**，绕开 PyAV；若仍报错执行 `python -m pip install -U faster-whisper` |
| 首次识别很慢（十几秒） | Whisper 模型在下载/加载，属于正常现象；`tiny` 最快，`small` 更准 |
| 说话说完不自动提交 | VAD 阈值偏保守。可在 `frontend/src/constants/interactionConstants.ts` 调整 `VAD_SILENCE_STOP_MS` / `VAD_SPEECH_RMS_THRESHOLD` |
| 数字人显示「Canvas 兜底（…）」 | Live2D 运行库或模型加载失败/超时。检查能否访问 `cubism.live2d.com` 与 `cdn.jsdelivr.net`；若使用自定义模型，确认 `VITE_LIVE2D_MODEL_URL` 地址可访问且格式为 Cubism 3/4/5 |
| 数字人一直显示「Live2D 数字人加载中…」 | 模型约 5MB，首屏需下载。等待即可；若长时间不出现，按上一条排查网络 |
| 装了 `pixi-live2d-display` 后报 Pixi 相关错误 | 该加载器仅支持 **pixi.js v6/v7**。确认 `package.json` 里 `pixi.js` 为 `^6`，不要升到 v8 |

---

## 九、隐私与安全说明（对应开发规范）

- 录音仅在浏览器内存中拼接，POST 上传后由后端识别，**不落盘**（后端使用 `memoryStorage`，临时 WAV 识别完立即删除，见 `asrService.ts` 的 `finally` 块）。
- 上传接口限制单文件体积（`UPLOAD_MAX_BYTES`，默认 20MB）并**校验 MIME 类型白名单**，防止上传恶意文件。
- 音频参数硬编码：WAV 头字段、采样率、位深等均由常量声明，未散落魔法值。
