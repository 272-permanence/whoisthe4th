/**
 * @file 多模态交互类型定义
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 对话、语音采集、SSE 事件负载等类型，接口用 interface，联合类型用 type。
 */

/** 对话角色 */
export type ChatRole = 'user' | 'assistant'

/** 单轮对话消息 */
export interface ChatTurn {
  id: string
  role: ChatRole
  text: string
  createdAt: number
}

/** 语音采集的 VAD 状态 */
export type VadState = 'idle' | 'silence' | 'speech'

/** ASR 接口返回的数据体 */
export interface AsrResultData {
  text: string
  /** 实际生效的识别提供方 */
  provider: string
  durationMs: number
}

/** 后端统一响应结构 */
export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

/** SSE：meta 事件负载 */
export interface TtsMetaPayload {
  streamId: string
  text: string
  provider: string
  voice: string
  format: string
  sampleRate: number
}

/** SSE：audio 事件负载 */
export interface TtsAudioPayload {
  seq: number
  /** base64 编码的音频分片 */
  chunk: string
  byteLength: number
}

/** SSE：done 事件负载 */
export interface TtsDonePayload {
  streamId: string
  totalChunks: number
  provider: string
}

/** SSE：error 事件负载 */
export interface TtsErrorPayload {
  code: number
  message: string
}
