/**
 * @file 后端配置管理模块
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 统一从环境变量读取服务配置（端口、ASR/TTS 提供方、超时时间等）。
 *              业务代码禁止硬编码端口、URL、超时时间等魔法值。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

/** 后端工程根目录（src/ 与编译产物 dist/ 都只比根目录深一层） */
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 默认值：所有魔法值在此统一声明 ----------
const DEFAULT_PORT = 8000;
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_ASR_TIMEOUT_MS = 30_000;
const DEFAULT_ASR_LANGUAGE = 'zh';
const DEFAULT_ASR_MOCK_TEXT = '西湖景区有哪些值得游览的景点？';
const DEFAULT_WHISPER_API_URL = 'https://api.openai.com/v1';
const DEFAULT_WHISPER_MODEL = 'whisper-1';
const DEFAULT_TTS_VOICE = 'zh-CN-XiaoxiaoNeural';
const DEFAULT_TTS_RATE = '+0%';
const DEFAULT_TTS_VOLUME = '+0%';
const DEFAULT_TTS_PITCH = '+0Hz';
const DEFAULT_TTS_MOCK_SAMPLE_RATE = 24_000;
const DEFAULT_DASHSCOPE_MODEL = 'qwen-plus';
/** DashScope OpenAI 兼容端点（中国区） */
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/** ASR 提供方：mock 离线桩 / whisper-api 远程接口 / whisper-cli 本地 Whisper 可执行程序 */
export type AsrProvider = 'mock' | 'whisper-api' | 'whisper-cli';

/** TTS 提供方：edge 微软 Edge 在线合成（Python edge-tts）/ mock 离线合成（无网络演示用） */
export type TtsProvider = 'edge' | 'mock';

/**
 * 读取字符串型环境变量
 * @param name 环境变量名
 * @param fallback 未配置时的默认值
 * @returns 环境变量值或默认值
 */
function readText(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/**
 * 读取整数型环境变量
 * @param name 环境变量名
 * @param fallback 未配置或非法时的默认值
 * @returns 解析后的整数
 */
function readInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(readText(name, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: readInt('PORT', DEFAULT_PORT),
  frontendUrl: readText('FRONTEND_URL', DEFAULT_FRONTEND_URL),
  /** 单次音频上传的体积上限（字节） */
  uploadMaxBytes: readInt('UPLOAD_MAX_BYTES', DEFAULT_UPLOAD_MAX_BYTES),

  // DashScope 配置（OpenAI 兼容模式），供成员B 的流式问答接口使用
  dashscope: {
    apiKey: readText('DASHSCOPE_API_KEY', ''),
    model: readText('DASHSCOPE_MODEL', DEFAULT_DASHSCOPE_MODEL),
    baseUrl: DASHSCOPE_BASE_URL
  },

  asr: {
    provider: readText('ASR_PROVIDER', 'mock') as AsrProvider,
    language: readText('ASR_LANGUAGE', DEFAULT_ASR_LANGUAGE),
    timeoutMs: readInt('ASR_TIMEOUT_MS', DEFAULT_ASR_TIMEOUT_MS),
    /** OpenAI 兼容的语音识别接口地址，如硅基流动、阿里云百炼的 /v1 均可复用 */
    whisperApiUrl: readText('WHISPER_API_URL', DEFAULT_WHISPER_API_URL),
    whisperApiKey: readText('WHISPER_API_KEY', ''),
    whisperModel: readText('WHISPER_MODEL', DEFAULT_WHISPER_MODEL),
    /** mock 提供方返回的固定文本（离线演示用） */
    mockText: readText('ASR_MOCK_TEXT', DEFAULT_ASR_MOCK_TEXT),
    /** whisper-cli 提供方：可执行程序，如 python 或 whisper-cli（whisper.cpp） */
    cliBin: readText('ASR_CLI_BIN', 'python'),
    /** whisper-cli 提供方：参数模板，{audio} 会被替换为临时 WAV 文件路径 */
    cliArgs: readText(
      'ASR_CLI_ARGS',
      `${path.join(BACKEND_ROOT, 'scripts', 'whisper_transcribe.py')} --audio {audio} --model small`
    )
  },

  tts: {
    provider: readText('TTS_PROVIDER', 'edge') as TtsProvider,
    /** 具备 edge-tts 依赖的 Python 解释器路径 */
    python: readText('TTS_PYTHON', 'python'),
    /** 流式合成脚本路径 */
    edgeScript: readText('TTS_EDGE_SCRIPT', path.join(BACKEND_ROOT, 'scripts', 'edge_tts_stream.py')),
    voice: readText('TTS_VOICE', DEFAULT_TTS_VOICE),
    rate: readText('TTS_RATE', DEFAULT_TTS_RATE),
    volume: readText('TTS_VOLUME', DEFAULT_TTS_VOLUME),
    pitch: readText('TTS_PITCH', DEFAULT_TTS_PITCH),
    /** mock 提供方生成的音频采样率 */
    mockSampleRate: readInt('TTS_MOCK_SAMPLE_RATE', DEFAULT_TTS_MOCK_SAMPLE_RATE)
  }
} as const;
