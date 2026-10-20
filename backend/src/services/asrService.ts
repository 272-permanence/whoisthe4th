/**
 * @file ASR（语音转文字）服务
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 支持三种提供方：mock（离线桩，用于跑通链路）、whisper-api（OpenAI 兼容的远程接口，
 *              可对接硅基流动/阿里云百炼等）、whisper-cli（本地 Whisper 可执行程序，
 *              默认指向 scripts/whisper_transcribe.py 的 faster-whisper 实现）。
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config, type AsrProvider } from '../config.js';
import { delay } from '../utils/timing.js';

/** 语音识别入参 */
export interface TranscribeParams {
  /** 音频二进制（前端统一转换为 16bit 单声道 16kHz WAV） */
  buffer: Buffer;
  /** MIME 类型 */
  mimetype: string;
  /** 原始文件名，远程接口据此识别音频格式 */
  filename: string;
}

/** 语音识别结果 */
export interface AsrResult {
  text: string;
  /** 实际生效的提供方 */
  provider: AsrProvider;
  /** 识别耗时（毫秒） */
  durationMs: number;
}

/** 子进程执行结果 */
interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** mock 提供方模拟的识别耗时（毫秒） */
const MOCK_LATENCY_MS = 300;
/** 本地识别程序错误信息保留长度（字符） */
const CLI_ERROR_TAIL_CHARS = 500;
/** 远程接口错误响应保留长度（字符） */
const REMOTE_ERROR_CHARS = 300;
/** whisper.cpp 纯文本输出中的时间戳前缀，如 [00:00:00.000 --> 00:00:02.000] */
const TIMESTAMP_PREFIX_PATTERN = /^\[[\d:.\s>-]+\]\s*/;
/** 连续空白字符 */
const WHITESPACE_PATTERN = /\s+/g;
/** URL 末尾斜杠 */
const TRAILING_SLASH_PATTERN = /\/+$/;

/**
 * 运行子进程并收集输出
 * @param bin 可执行程序
 * @param args 参数列表
 * @returns 进程的标准输出、标准错误与退出码
 * @throws {Error} 进程启动失败或执行超时时抛出
 */
function runProcess(bin: string, args: string[]): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (piece: string) => {
      stdout += piece;
    });
    child.stderr.on('data', (piece: string) => {
      stderr += piece;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`本地语音识别超时（>${config.asr.timeoutMs}ms）`));
    }, config.asr.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

/**
 * 通过 OpenAI 兼容接口识别语音
 * @param params 识别入参
 * @returns 识别文本
 * @throws {Error} 未配置 API Key 或接口返回非 2xx 时抛出
 */
async function transcribeByWhisperApi(params: TranscribeParams): Promise<string> {
  if (config.asr.whisperApiKey === '') {
    throw new Error('未配置 WHISPER_API_KEY，请改用 ASR_PROVIDER=whisper-cli 或 mock');
  }
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(params.buffer)], { type: params.mimetype }), params.filename);
  formData.append('model', config.asr.whisperModel);
  formData.append('language', config.asr.language);
  formData.append('response_format', 'json');

  const endpoint = `${config.asr.whisperApiUrl.replace(TRAILING_SLASH_PATTERN, '')}/audio/transcriptions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.asr.whisperApiKey}` },
    body: formData,
    signal: AbortSignal.timeout(config.asr.timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`语音识别接口返回 ${response.status}: ${detail.slice(0, REMOTE_ERROR_CHARS)}`);
  }
  const payload = (await response.json()) as { text?: string };
  return (payload.text ?? '').trim();
}

/**
 * 解析本地识别程序的输出，兼容纯文本与 JSON 两种格式
 * @param stdout 标准输出内容
 * @returns 识别文本
 */
function parseCliStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed.startsWith('{')) {
    try {
      const payload = JSON.parse(trimmed) as { text?: string };
      if (typeof payload.text === 'string') {
        return payload.text.trim();
      }
    } catch {
      // 不是合法 JSON，继续按纯文本解析（whisper.cpp -oj 以外的输出格式）
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.replace(TIMESTAMP_PREFIX_PATTERN, ''))
    .join(' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

/**
 * 生成本地识别程序的参数列表
 * @param audioPath 临时音频文件路径
 * @returns 参数数组，{audio} 占位符已被实际路径替换
 */
function buildCliArgs(audioPath: string): string[] {
  return config.asr.cliArgs
    .split(' ')
    .filter((token) => token !== '')
    .map((token) => (token === '{audio}' ? audioPath : token));
}

/**
 * 通过本地 Whisper 可执行程序识别语音
 * @param params 识别入参
 * @returns 识别文本
 * @throws {Error} 可执行程序启动失败、超时或退出码非 0 时抛出
 */
async function transcribeByWhisperCli(params: TranscribeParams): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asr-'));
  const audioPath = path.join(tempDir, `${randomUUID()}.wav`);
  try {
    await fs.writeFile(audioPath, params.buffer);
    const result = await runProcess(config.asr.cliBin, buildCliArgs(audioPath));
    if (result.code !== 0) {
      throw new Error(`本地识别程序退出码 ${result.code}: ${result.stderr.slice(-CLI_ERROR_TAIL_CHARS)}`);
    }
    return parseCliStdout(result.stdout);
  } finally {
    // 无论成功失败都清理临时音频
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * 语音转文字
 * @param params 识别入参，包含音频二进制与 MIME 类型
 * @returns 识别结果，含文本、生效提供方与耗时
 * @throws {Error} 任一提供方识别失败时抛出，由控制器统一转换为错误响应
 */
export async function transcribeAudio(params: TranscribeParams): Promise<AsrResult> {
  const startedAt = Date.now();
  let text: string;
  switch (config.asr.provider) {
    case 'whisper-api':
      text = await transcribeByWhisperApi(params);
      break;
    case 'whisper-cli':
      text = await transcribeByWhisperCli(params);
      break;
    case 'mock':
    default:
      // 离线桩：等待一小段模拟真实识别耗时，返回固定文本用于跑通「语音输入 → 数字人回答」链路
      await delay(MOCK_LATENCY_MS);
      text = config.asr.mockText;
      break;
  }
  return { text, provider: config.asr.provider, durationMs: Date.now() - startedAt };
}
