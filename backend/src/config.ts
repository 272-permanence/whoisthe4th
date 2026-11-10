/**
 * @file 后端配置管理模块
 * @author 第八组
 * @date 2026-10-15
 * @description 统一从环境变量读取服务配置（端口、ASR/TTS 提供方、超时时间等）。
 *              业务代码禁止硬编码端口、URL、超时时间等魔法值。
 *              MySQL 读写分离（成员D 牵头）+ JWT（成员C）+ 高德（成员B）三段配置共存。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { KB_EMBEDDING_DIMENSION } from './constants/kbConstants.js';

dotenv.config();

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 默认值 ----------
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
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_EMBEDDING_MODEL = 'bge-m3';
const DEFAULT_DB_MASTER_PORT = 3307;
const DEFAULT_DB_SLAVE_PORT = 3307;

export type AsrProvider = 'mock' | 'whisper-api' | 'whisper-cli';
export type TtsProvider = 'edge' | 'mock';

function readText(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}
function readInt(name: string, fallback: number): number {
  const p = Number.parseInt(readText(name, String(fallback)), 10);
  return Number.isFinite(p) ? p : fallback;
}

export const config = {
  port: readInt('PORT', DEFAULT_PORT),
  frontendUrl: readText('FRONTEND_URL', DEFAULT_FRONTEND_URL),
  uploadMaxBytes: readInt('UPLOAD_MAX_BYTES', DEFAULT_UPLOAD_MAX_BYTES),

  // DashScope（成员B：流式问答）
  dashscope: {
    apiKey: readText('DASHSCOPE_API_KEY', ''),
    model: readText('DASHSCOPE_MODEL', DEFAULT_DASHSCOPE_MODEL),
    baseUrl: DASHSCOPE_BASE_URL
  },

  // 高德地图（成员B：导航页）
  amap: {
    jsKey: readText('AMAP_JS_KEY', ''),
    jsSecurityCode: readText('AMAP_JS_SECURITY_CODE', ''),
    webServiceKey: readText('AMAP_WEB_SERVICE_KEY', ''),
    directionWalkingUrl: 'https://restapi.amap.com/v3/direction/walking',
    directionDrivingUrl: 'https://restapi.amap.com/v3/direction/driving',
    directionDrivingAvoidUrl: 'https://restapi.amap.com/v3/direction/driving?extensions=all&strategy=10'
  },

  asr: {
    provider: readText('ASR_PROVIDER', 'mock') as AsrProvider,
    language: readText('ASR_LANGUAGE', DEFAULT_ASR_LANGUAGE),
    timeoutMs: readInt('ASR_TIMEOUT_MS', DEFAULT_ASR_TIMEOUT_MS),
    whisperApiUrl: readText('WHISPER_API_URL', DEFAULT_WHISPER_API_URL),
    whisperApiKey: readText('WHISPER_API_KEY', ''),
    whisperModel: readText('WHISPER_MODEL', DEFAULT_WHISPER_MODEL),
    mockText: readText('ASR_MOCK_TEXT', DEFAULT_ASR_MOCK_TEXT),
    cliBin: readText('ASR_CLI_BIN', 'python'),
    cliArgs: readText('ASR_CLI_ARGS', `${path.join(BACKEND_ROOT, 'scripts', 'whisper_transcribe.py')} --audio {audio} --model small`)
  },

  tts: {
    provider: readText('TTS_PROVIDER', 'edge') as TtsProvider,
    python: readText('TTS_PYTHON', 'python'),
    edgeScript: readText('TTS_EDGE_SCRIPT', path.join(BACKEND_ROOT, 'scripts', 'edge_tts_stream.py')),
    voice: readText('TTS_VOICE', DEFAULT_TTS_VOICE),
    rate: readText('TTS_RATE', DEFAULT_TTS_RATE),
    volume: readText('TTS_VOLUME', DEFAULT_TTS_VOLUME),
    pitch: readText('TTS_PITCH', DEFAULT_TTS_PITCH),
    mockSampleRate: readInt('TTS_MOCK_SAMPLE_RATE', DEFAULT_TTS_MOCK_SAMPLE_RATE)
  },

  // 知识库（成员C）
  qdrantUrl: readText('QDRANT_URL', ''),
  embeddingApiUrl: readText('EMBEDDING_API_URL', ''),
  embeddingApiKey: readText('EMBEDDING_API_KEY', ''),
  embeddingModel: readText('EMBEDDING_MODEL', DEFAULT_EMBEDDING_MODEL),
  embeddingDimension: readInt('EMBEDDING_DIMENSION', KB_EMBEDDING_DIMENSION),

  // JWT 认证（成员C）
  jwt: {
    secret: readText('JWT_SECRET', 'scenic-ai-dev-secret-change-in-production-2026'),
    expiresIn: readText('JWT_EXPIRES_IN', '7d')
  },

  // MySQL 读写分离（成员D 牵头，全组复用）
  db: {
    database: readText('DB_NAME', 'scenic_ai'),
    user: readText('DB_USER', 'root'),
    password: readText('DB_PASSWORD', ''),
    master: {
      host: readText('DB_MASTER_HOST', '127.0.0.1'),
      port: readInt('DB_MASTER_PORT', DEFAULT_DB_MASTER_PORT)
    },
    slave: {
      host: readText('DB_SLAVE_HOST', '127.0.0.1'),
      port: readInt('DB_SLAVE_PORT', DEFAULT_DB_SLAVE_PORT)
    }
  }
} as const;
