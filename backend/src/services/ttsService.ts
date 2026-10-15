/**
 * @file TTS（文字转语音）服务
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 提供 edge（微软 Edge 在线合成，走 Python edge-tts）与 mock（离线模拟合成）两种实现，
 *              统一暴露「元信息 + 异步生成器分片」的流式接口，由 SSE 控制器逐块下发前端。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { config, type TtsProvider } from '../config.js';
import { synthesizeMockWav } from './mockSpeechSynthesizer.js';
import { delay } from '../utils/timing.js';

/** 流式合成元信息 */
export interface TtsStreamMeta {
  provider: TtsProvider;
  voice: string;
  format: 'mp3' | 'wav';
  sampleRate: number;
}

/** 音频分片类型：subarray 视图的底层缓冲区为 ArrayBufferLike，故显式声明泛型 */
export type AudioChunk = Buffer<ArrayBufferLike>;

/** 一次流式合成的句柄 */
export interface TtsStream {
  meta: TtsStreamMeta;
  /** 逐分片产出音频数据 */
  chunks: AsyncGenerator<AudioChunk, void, void>;
  /** 客户端断开时释放底层资源（例如终止 Python 子进程） */
  dispose: () => void;
}

/** Edge-TTS 输出为 24kHz 单声道 MP3 */
const EDGE_SAMPLE_RATE = 24_000;
/** 合并小分片后再下发，避免单个 SSE 事件过于碎片化 */
const MIN_CHUNK_BYTES = 8 * 1024;
/** 报错时保留的 stderr 尾部长度（字节） */
const STDERR_TAIL_BYTES = 500;
/** 探测 Python 依赖是否就绪的超时时间（毫秒） */
const PROBE_TIMEOUT_MS = 10_000;
/** mock 提供方模拟流式推送的块间隔（毫秒） */
const MOCK_CHUNK_INTERVAL_MS = 60;
/** mock 提供方的音色标识 */
const MOCK_VOICE_NAME = 'mock-synthesized';

/** edge 提供方可用性探测缓存，避免每次请求都拉起 Python */
let edgeAvailability: Promise<boolean> | null = null;

/**
 * 探测 Python 解释器与 edge-tts 依赖是否就绪
 * @returns 就绪返回 true，否则返回 false
 */
function probeEdgeTts(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!fs.existsSync(config.tts.edgeScript)) {
      console.warn('[tts] 未找到流式合成脚本: %s', config.tts.edgeScript);
      resolve(false);
      return;
    }
    const child = spawn(config.tts.python, ['-c', 'import edge_tts'], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, PROBE_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * 解析当前实际生效的 TTS 提供方：配置为 edge 但依赖不可用时自动降级为 mock
 * @returns 实际生效的提供方
 */
export async function resolveTtsProvider(): Promise<TtsProvider> {
  if (config.tts.provider === 'mock') {
    return 'mock';
  }
  edgeAvailability ??= probeEdgeTts();
  const isAvailable = await edgeAvailability;
  if (!isAvailable) {
    console.warn('[tts] 未检测到可用的 edge-tts（请执行 pip install edge-tts 并配置 TTS_PYTHON），本次降级为 mock 合成');
    return 'mock';
  }
  return 'edge';
}

/**
 * 创建 edge-tts 流式合成句柄
 * @param text 待合成文本
 * @returns 流式合成句柄
 */
function createEdgeStream(text: string): TtsStream {
  const child = spawn(
    config.tts.python,
    [
      config.tts.edgeScript,
      '--text',
      text,
      '--voice',
      config.tts.voice,
      '--rate',
      config.tts.rate,
      '--volume',
      config.tts.volume,
      '--pitch',
      config.tts.pitch
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderrTail = '';
  // 客户端主动断开时会 dispose 并终止子进程，此时不应把退出码异常当成合成失败
  let isDisposed = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (piece: string) => {
    stderrTail = (stderrTail + piece).slice(-STDERR_TAIL_BYTES);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on('close', (code) => {
      resolve(code);
    });
  });

  const chunks = (async function* generateAudioChunks(): AsyncGenerator<AudioChunk, void, void> {
    let pending: AudioChunk = Buffer.alloc(0);
    try {
      for await (const piece of child.stdout as AsyncIterable<Buffer>) {
        pending = pending.length === 0 ? piece : Buffer.concat([pending, piece]);
        while (pending.length >= MIN_CHUNK_BYTES) {
          yield pending.subarray(0, MIN_CHUNK_BYTES);
          pending = pending.subarray(MIN_CHUNK_BYTES);
        }
      }
      const exitCode = await exited;
      if (!isDisposed && exitCode !== 0) {
        // 合成失败时抛给上层，由控制器下发 error 事件
        throw new Error(stderrTail.trim() || `edge-tts 进程异常退出，退出码 ${exitCode}`);
      }
      if (!isDisposed && pending.length > 0) {
        yield pending;
      }
    } finally {
      isDisposed = true;
      if (child.exitCode === null) {
        child.kill();
      }
    }
  })();

  return {
    meta: { provider: 'edge', voice: config.tts.voice, format: 'mp3', sampleRate: EDGE_SAMPLE_RATE },
    chunks,
    dispose: () => {
      isDisposed = true;
      if (child.exitCode === null) {
        child.kill();
      }
    }
  };
}

/**
 * 创建离线模拟合成句柄
 * @param text 待合成文本
 * @returns 流式合成句柄
 */
function createMockStream(text: string): TtsStream {
  // 先一次性生成完整波形，再按块延时下发，模拟真实流式节奏
  const wav = synthesizeMockWav(text, config.tts.mockSampleRate);
  const chunks = (async function* generateAudioChunks(): AsyncGenerator<AudioChunk, void, void> {
    for (let offset = 0; offset < wav.length; offset += MIN_CHUNK_BYTES) {
      await delay(MOCK_CHUNK_INTERVAL_MS);
      yield wav.subarray(offset, offset + MIN_CHUNK_BYTES);
    }
  })();

  return {
    meta: { provider: 'mock', voice: MOCK_VOICE_NAME, format: 'wav', sampleRate: config.tts.mockSampleRate },
    chunks,
    dispose: () => undefined
  };
}

/**
 * 创建一次流式语音合成
 * @param text 待合成文本
 * @returns 流式合成句柄，包含元信息、分片生成器与资源释放函数
 * @throws {Error} 合成过程中失败时由分片生成器抛出
 */
export async function createTtsStream(text: string): Promise<TtsStream> {
  const provider = await resolveTtsProvider();
  return provider === 'edge' ? createEdgeStream(text) : createMockStream(text);
}
