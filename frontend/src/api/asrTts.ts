/**
 * @file ASR / TTS 接口封装
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 语音识别走 POST 上传音频，语音合成走 EventSource 订阅 SSE 流。
 *              HTTP 请求统一委托 common/apiClient.apiFetch，避免散落的裸 fetch。
 */
import { apiFetch } from '../common/apiClient';
import { API_BASE_URL, INTERACTION_API_PREFIX } from '../constants/apiConstants';
import type { AsrResultData } from '../types/interaction';

/** 上传音频时使用的文件名 */
const AUDIO_UPLOAD_FILENAME = 'speech.wav';

/**
 * 上传音频并获取识别文本
 * @param blob 16kHz 单声道 WAV 录音数据
 * @returns 识别结果，含文本、生效提供方与耗时
 * @throws {Error} 网络异常或后端返回业务错误码时抛出
 */
export async function transcribeAudio(blob: Blob): Promise<AsrResultData> {
  const formData = new FormData();
  formData.append('audio', blob, AUDIO_UPLOAD_FILENAME);
  return apiFetch<AsrResultData>('/asr', { method: 'POST', body: formData });
}

/**
 * 构造 TTS 流式接口地址
 * @param params 文本与断线续传序号
 * @returns 供 EventSource 订阅的完整 URL
 */
export function buildTtsStreamUrl(params: { text: string; lastSeq: number }): string {
  const query = new URLSearchParams({ text: params.text, lastSeq: String(params.lastSeq) })
  return `${API_BASE_URL}${INTERACTION_API_PREFIX}/tts/stream?${query.toString()}`
}
