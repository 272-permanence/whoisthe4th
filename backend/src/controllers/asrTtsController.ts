/**
 * @file ASR/TTS 控制器
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 编排语音识别（上传音频返回文本）与语音合成（SSE 流式推送音频分片）请求，
 *              负责参数校验、错误码转换、SSE 事件下发与断线续传。
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ErrorCodeEnum } from '../constants/errorCodes.js';
import { transcribeAudio } from '../services/asrService.js';
import { createTtsStream, type TtsStream } from '../services/ttsService.js';
import { initSseStream, sendSseEvent, startSseHeartbeat, SseEventEnum } from '../common/sse.js';

/** 单次合成文本长度上限（字符） */
const MAX_TTS_TEXT_LENGTH = 500;
/** 续传序号的合法下界 */
const MIN_RESUME_SEQ = 0;

/** 允许上传的音频 MIME 类型白名单（安全规约要求校验文件类型，防止上传恶意文件） */
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a'
]);

/**
 * 解析查询参数中的断线续传序号
 * @param raw 原始查询值
 * @returns 合法序号，缺失或非法时返回 0
 */
function parseLastSeq(raw: unknown): number {
  if (typeof raw !== 'string') {
    return MIN_RESUME_SEQ;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > MIN_RESUME_SEQ ? parsed : MIN_RESUME_SEQ;
}

/**
 * 语音转文字：接收 multipart/form-data 中的 audio 字段
 * @param req Express 请求对象，音频由 multer 解析到 req.file
 * @param res Express 响应对象
 */
export async function handleTranscribe(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (file === undefined) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_AUDIO, message: '缺少 audio 音频文件字段' });
    return;
  }
  if (!ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_AUDIO, message: `不支持的音频类型: ${file.mimetype}` });
    return;
  }
  try {
    const result = await transcribeAudio({
      buffer: file.buffer,
      mimetype: file.mimetype,
      filename: file.originalname === '' ? 'audio.wav' : file.originalname
    });
    res.json({ code: 0, message: 'success', data: result });
  } catch (error) {
    console.error('[asr] 语音识别失败: %s', error);
    res.status(500).json({
      code: ErrorCodeEnum.ASR_FAILED,
      message: error instanceof Error ? error.message : '语音识别失败'
    });
  }
}

/**
 * 文字转语音：SSE 流式输出音频分片
 * @param req Express 请求对象，文本通过查询参数 text 传入（EventSource 仅支持 GET，无法携带请求体）
 * @param res Express 响应对象
 */
export async function handleTtsStream(req: Request, res: Response): Promise<void> {
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  if (text === '') {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'text 参数不能为空' });
    return;
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    res.status(400).json({
      code: ErrorCodeEnum.INVALID_PARAM,
      message: `text 长度不能超过 ${MAX_TTS_TEXT_LENGTH} 个字符`
    });
    return;
  }

  const lastSeq = parseLastSeq(req.query.lastSeq);
  const streamId = randomUUID();

  initSseStream(res);
  const stopHeartbeat = startSseHeartbeat(res);

  let stream: TtsStream | null = null;
  let isClientClosed = false;
  // 监听 res 而非 req：Express 4 / Node 16+ 下 req 的 close 会在请求体读取完成时提前触发，
  // 导致流式合成刚起步就被判定为「客户端断开」；res 的 close 才代表连接真正断开。
  res.on('close', () => {
    // 客户端断开（刷新页面、切换提问）时立即终止合成，避免白白消耗资源
    isClientClosed = true;
    stream?.dispose();
  });

  try {
    stream = await createTtsStream(text);
    if (isClientClosed) {
      stream.dispose();
      return;
    }
    sendSseEvent(res, SseEventEnum.META, { streamId, text, ...stream.meta });

    let seq = 0;
    for await (const chunk of stream.chunks) {
      if (isClientClosed) {
        break;
      }
      seq += 1;
      // 断线续传：跳过客户端已收到的分片
      if (seq <= lastSeq) {
        continue;
      }
      sendSseEvent(res, SseEventEnum.AUDIO, { seq, chunk: chunk.toString('base64'), byteLength: chunk.length }, seq);
    }
    if (!isClientClosed) {
      sendSseEvent(res, SseEventEnum.DONE, { streamId, totalChunks: seq, provider: stream.meta.provider });
    }
  } catch (error) {
    // 客户端主动断开（刷新页面、切换提问）造成的终止不算异常，避免日志噪音
    if (isClientClosed) {
      return;
    }
    console.error('[tts] 语音合成失败: %s', error);
    sendSseEvent(res, SseEventEnum.ERROR, {
      code: ErrorCodeEnum.TTS_FAILED,
      message: error instanceof Error ? error.message : '语音合成失败'
    });
  } finally {
    stopHeartbeat();
    stream?.dispose();
    res.end();
  }
}
