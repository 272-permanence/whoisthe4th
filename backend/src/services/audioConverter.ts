/**
 * @file 音频格式转换服务（手机 webm/ogg → Whisper 可识别的 WAV 16kHz mono）
 * @author 第八组（成员A）
 * @date 2026-11-03
 * @description 手机端 MediaRecorder 生成的录音格式（Chrome 默认 webm/opus，Safari 默认 ogg）
 *              Whisper CLI 不都直接处理，统一转成 16kHz 单声道 WAV 再上传识别。
 *              内部通过 ffmpeg-static 拿到预编译二进制路径，用 fluent-ffmpeg 调用；
 *              若 ffmpeg 不可用（开发机未跑 install.js 或部署环境未安装），
 *              自动降级为「原样返回 buffer」，不阻断 ASR 主流程。
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../common/logger.js';

const logger = createLogger('audio-converter');

/** ESM 项目里加载 CJS 模块（fluent-ffmpeg / ffmpeg-static 均为 CommonJS 包） */
const require = createRequire(import.meta.url);

/** fluent-ffmpeg 默认导出是函数（CommonJS require） */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg: any = require('fluent-ffmpeg');

let ffmpegBinaryPath: string | null = null;
let ffmpegAvailable: boolean | null = null;

/**
 * 初始化 ffmpeg 路径：优先用 ffmpeg-static 的预编译二进制，
 * 不可用时 ffmpeg 会自己在 PATH 里找系统 ffmpeg
 */
function initFfmpeg(): void {
  if (ffmpegAvailable !== null) {
    return; // 已初始化
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static');
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) {
      ffmpegBinaryPath = ffmpegStatic;
      ffmpeg.setFfmpegPath(ffmpegBinaryPath);
      logger.INFO(`ffmpeg 二进制: ${ffmpegBinaryPath}`);
    } else {
      // 新版 ffmpeg-static 导出函数
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { path } = require('ffmpeg-static');
      if (typeof path === 'function') {
        ffmpegBinaryPath = path();
        ffmpeg.setFfmpegPath(ffmpegBinaryPath);
        logger.INFO(`ffmpeg 二进制: ${ffmpegBinaryPath}`);
      }
    }
    ffmpegAvailable = true;
  } catch (err) {
    logger.WARN(`ffmpeg-static 不可用，尝试用系统 ffmpeg: ${err instanceof Error ? err.message : err}`);
    ffmpegAvailable = false;
  }
}

/** 转换结果 */
export interface AudioConvertResult {
  /** 转换后的 Buffer（ffmpeg 不可用时返回原始 buffer） */
  buffer: Buffer;
  /** 转换后的 MIME 类型（固定 audio/wav） */
  mimetype: string;
  /** 转换后的文件名（带 .wav 后缀） */
  filename: string;
  /** 是否实际进行了格式转换（ffmpeg 可用 + 输入非 wav） */
  converted: boolean;
}

/** 不需要 ffmpeg 转换的格式（Whisper 能直接吃） */
const PASS_THROUGH_MIMETYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3'
]);

/**
 * 把任意上传音频统一转成 16kHz 单声道 16-bit WAV。
 *
 * 转换参数：
 *   -ar 16000  采样率 → Whisper 原生训练输入，强制降到 16k
 *   -ac 1      声道 → Whisper 吃 mono
 *   -sample_fmt s16  采样位深 → 16-bit PCM，Whisper CLI 可直接读取
 *   -c:a pcm_s16le   编码器 → WAV PCM
 *
 * @param buffer 原始音频 Buffer
 * @param mimetype 原始 MIME
 * @param filename 原始文件名
 * @returns 转换结果（ffmpeg 不可用时 converted=false 并返回原始数据）
 */
export async function convertAudioTo16kWav(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<AudioConvertResult> {
  // 1. 已在白名单 → 直接返回
  if (PASS_THROUGH_MIMETYPES.has(mimetype.toLowerCase())) {
    return {
      buffer,
      mimetype,
      filename,
      converted: false
    };
  }

  // 2. 初始化 ffmpeg
  initFfmpeg();
  if (!ffmpegAvailable) {
    logger.WARN(`ffmpeg 不可用，跳过转换（原样返回 ${mimetype}）`);
    return {
      buffer,
      mimetype,
      filename,
      converted: false
    };
  }

  // 3. 把 buffer 写到临时文件（ffmpeg 需要文件路径）
  const tmpDir = join(tmpdir(), 'whoisthe4th-audio');
  mkdirSync(tmpDir, { recursive: true });
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  const inputPath = join(tmpDir, `${id}-input.bin`);
  const outputPath = join(tmpDir, `${id}-output.wav`);
  writeFileSync(inputPath, buffer);

  try {
    // 4. 执行转换（fluent-ffmpeg 类型定义不完备，用 any 绕过）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmd: any = ffmpeg(inputPath);
    const wavBuffer = await new Promise<Buffer>((resolve, reject) => {
      cmd
        .outputFormat('wav')
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .on('error', (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        })
        .on('end', () => {
          try {
            resolve(readFileSync(outputPath));
          } catch (readErr) {
            reject(readErr);
          }
        })
        .save(outputPath);
    });

    logger.INFO(`音频转换成功 ${mimetype} → WAV 16kHz mono (${buffer.length}→${wavBuffer.length} bytes)`);
    return {
      buffer: wavBuffer,
      mimetype: 'audio/wav',
      filename: filename.replace(/\.[^.]+$/, '') + '.wav',
      converted: true
    };
  } catch (err) {
    logger.ERROR(`音频转换失败，降级返回原始 buffer: ${err instanceof Error ? err.message : err}`);
    return {
      buffer,
      mimetype,
      filename,
      converted: false
    };
  } finally {
    // 5. 清理临时文件
    try {
      unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
    try {
      if (unlinkSync) {
        unlinkSync(outputPath);
      }
    } catch {
      /* ignore */
    }
  }
}


