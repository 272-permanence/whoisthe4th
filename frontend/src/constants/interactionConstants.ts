/**
 * @file 多模态交互常量
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 语音采集 VAD 阈值、录音时长上限、数字人回答模板与 Live2D 数字人资源地址等常量。
 */

/** VAD：判定用户「已停止说话」所需的静音时长（毫秒） */
export const VAD_SILENCE_STOP_MS = 1_200
/** VAD：判定为说话的 RMS 音量阈值（0~1） */
export const VAD_SPEECH_RMS_THRESHOLD = 0.02
/** VAD：电平检测的采样间隔（毫秒） */
export const VAD_SAMPLE_INTERVAL_MS = 60
/** 单次录音的最长时长（毫秒），避免用户忘记停止 */
export const MAX_RECORDING_MS = 20_000
/** 音量电平的显示上限（超过该 RMS 即视为满格） */
export const LEVEL_DISPLAY_RMS_MAX = 0.35
/** 口型开合度参考音量上限，用于把 RMS 映射到 0~1 的口型开合 */
export const LIP_SYNC_RMS_REFERENCE = 0.12
/** 口型张开的平滑系数（越大跟得越紧） */
export const LIP_SYNC_ATTACK = 0.5
/** 口型闭合的平滑系数（越小闭合越慢，接近真实说话） */
export const LIP_SYNC_RELEASE = 0.18
/** TTS 流断线重连的最大次数 */
export const TTS_MAX_RECONNECT = 3
/** TTS 流断线重连的基础退避时间（毫秒） */
export const TTS_RECONNECT_BASE_DELAY_MS = 800
/** 数字人回答模板。后续接入成员B的 RAG + LLM 流式回答后，替换为真实回答文本即可 */
export const GUIDE_REPLY_TEMPLATE = '收到你的问题：「{question}」。我是西湖景区导览数字人小导，很高兴为你服务。'
/** 模板中问题的占位符 */
export const GUIDE_REPLY_QUESTION_PLACEHOLDER = '{question}'

/**
 * Live2D Cubism Core 运行库地址。
 * 该文件为 Live2D Inc. 的闭源专有软件（Redistributable Code），由官方 CDN 分发，
 * 按 Live2D 官方许可协议免费用于本项目，**不随仓库分发**，运行时才从 CDN 加载。
 */
export const LIVE2D_CUBISM_CORE_SCRIPT_URL =
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'

/**
 * Live2D 示例模型默认地址：官方免费样例「桃濑日和」(Hiyori, Cubism 4)。
 * 模型素材版权归 Live2D Inc.，条款禁止再分发，因此**不进入仓库**，运行时经 CDN 引用。
 */
export const LIVE2D_MODEL_DEFAULT_URL =
  'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Hiyori/Hiyori.model3.json'

/** Live2D 模型地址，优先读取 Vite 环境变量 VITE_LIVE2D_MODEL_URL，便于换成自有或本地模型 */
export const LIVE2D_MODEL_URL = import.meta.env.VITE_LIVE2D_MODEL_URL ?? LIVE2D_MODEL_DEFAULT_URL

/** Live2D 口型同步参数 ID，与模型 model3.json 中 LipSync 分组声明的参数保持一致 */
export const LIVE2D_MOUTH_PARAM_ID = 'ParamMouthOpenY'
/** Cubism Core 脚本加载超时（毫秒），超时即判定 Live2D 不可用并降级为 Canvas 数字人 */
export const LIVE2D_CORE_LOAD_TIMEOUT_MS = 8_000
/** 模型加载超时（毫秒），超时即判定 Live2D 不可用并降级为 Canvas 数字人 */
export const LIVE2D_MODEL_LOAD_TIMEOUT_MS = 12_000
/** Live2D 形象在容器内的占高比例，留出上下留白 */
export const LIVE2D_FIT_RATIO = 0.96
