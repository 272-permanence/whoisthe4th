/**
 * @file TTS 流式播放与数字人口型驱动组合式函数
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 订阅后端 SSE 语音合成流：按 meta 事件下发的音频格式选择播放策略——
 *              浏览器支持该格式的 MediaSource 时边收边播，否则等分片到齐后整段播放；
 *              播放过程中用 AnalyserNode 采样音频振幅，实时驱动数字人口型开合；
 *              流中断时携带 lastSeq 自动重连续传，避免重头播放。
 */
import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import { buildTtsStreamUrl } from '../api/asrTts'
import {
  LIP_SYNC_ATTACK,
  LIP_SYNC_RELEASE,
  LIP_SYNC_RMS_REFERENCE,
  TTS_MAX_RECONNECT,
  TTS_RECONNECT_BASE_DELAY_MS
} from '../constants/interactionConstants'
import type { TtsAudioPayload, TtsDonePayload, TtsErrorPayload, TtsMetaPayload } from '../types/interaction'
import { computeRms } from '../utils/audioLevel'

/** SSE 事件名，需与后端 SseEventEnum 保持一致 */
const SSE_EVENT_META = 'meta'
const SSE_EVENT_AUDIO = 'audio'
const SSE_EVENT_DONE = 'done'
const SSE_EVENT_ERROR = 'error'
/** Edge-TTS 输出 MP3 对应的 MIME */
const MIME_AUDIO_MPEG = 'audio/mpeg'
/** 离线模拟合成器输出 WAV 对应的 MIME */
const MIME_AUDIO_WAV = 'audio/wav'
/** 未收到 meta 事件时的兜底 MIME */
const DEFAULT_STREAM_MIME = MIME_AUDIO_MPEG
/** 频谱分析节点的 FFT 大小 */
const ANALYSER_FFT_SIZE = 512
/** 口型驱动采样的时间间隔（毫秒） */
const LIP_SYNC_INTERVAL_MS = 40
/** 重连续传时的退避倍数 */
const RECONNECT_BACKOFF_FACTOR = 2

/** TTS 流式播放控制器 */
export interface TtsStreamController {
  /** 是否处于语音合成/播放流程中 */
  isStreaming: Readonly<Ref<boolean>>
  /** 口型开合度 0~1，由播放中的音频振幅驱动 */
  mouthOpen: Readonly<Ref<number>>
  /** 实际生效的合成提供方，用于界面展示 */
  provider: Readonly<Ref<string>>
  /** 错误提示 */
  errorMessage: Readonly<Ref<string>>
  /** 请求数字人播报指定文本 */
  speak: (text: string) => void
  /** 立即停止播报并释放资源 */
  stop: () => void
}

/**
 * 把 base64 分片解码为字节数组
 * @param base64 base64 字符串
 * @returns 解码后的字节数组
 */
function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * TTS 流式播放与口型驱动组合式函数
 * @returns 流式播放控制器
 */
export function useTtsStream(): TtsStreamController {
  const isStreaming = ref(false)
  const mouthOpen = ref(0)
  const provider = ref('')
  const errorMessage = ref('')

  let eventSource: EventSource | null = null
  let audioElement: HTMLAudioElement | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let analyserBuffer: Uint8Array<ArrayBuffer> | null = null
  let mediaSource: MediaSource | null = null
  let sourceBuffer: SourceBuffer | null = null
  let mediaSourceUrl = ''
  let lipSyncTimer: number | null = null
  let reconnectTimer: number | null = null
  let lastSeq = 0
  let reconnectCount = 0
  let currentText = ''
  let hasReceivedDone = false
  let isUsingMediaSource = false
  let streamMimeType = DEFAULT_STREAM_MIME
  /** 「等待用户点击后恢复播放」的监听，避免自动播放被拦截后永久无声 */
  let userUnlockRetryHandler: (() => void) | null = null
  /** 本次流收到的全部分片，MSE 写入失败或不可用时据此整段播放 */
  const receivedChunks: Uint8Array<ArrayBuffer>[] = []
  /** 下一个待写入 SourceBuffer 的分片下标 */
  let nextAppendIndex = 0

  /**
   * 启动口型驱动采样
   */
  function startLipSync(): void {
    if (lipSyncTimer === null) {
      lipSyncTimer = window.setInterval(runLipSyncTick, LIP_SYNC_INTERVAL_MS)
    }
  }

  /**
   * 停止口型驱动采样并复位开合度
   */
  function stopLipSync(): void {
    if (lipSyncTimer !== null) {
      window.clearInterval(lipSyncTimer)
      lipSyncTimer = null
    }
    mouthOpen.value = 0
  }

  /**
   * 采样播放中的音频振幅并平滑为口型开合度
   */
  function runLipSyncTick(): void {
    if (analyser === null || analyserBuffer === null) {
      return
    }
    analyser.getByteTimeDomainData(analyserBuffer)
    const rms = computeRms(analyserBuffer)
    const target = Math.min(1, rms / LIP_SYNC_RMS_REFERENCE)
    // 张嘴快、闭嘴慢，更接近真实说话的口型节奏
    const coefficient = target > mouthOpen.value ? LIP_SYNC_ATTACK : LIP_SYNC_RELEASE
    mouthOpen.value += (target - mouthOpen.value) * coefficient
  }

  /**
   * 建立 Audio → Analyser → 扬声器 的播放与分析链路
   */
  function preparePlayback(): void {
    audioContext = new AudioContext()
    void audioContext.resume()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = ANALYSER_FFT_SIZE
    analyserBuffer = new Uint8Array(analyser.fftSize)
    audioElement = new Audio()
    audioElement.addEventListener('ended', () => {
      stopLipSync()
      isStreaming.value = false
    })
    const sourceNode = audioContext.createMediaElementSource(audioElement)
    sourceNode.connect(analyser)
    analyser.connect(audioContext.destination)
  }

  /**
   * 播放音频
   * 音频分片到达晚于用户点击（SSE 存在网络延迟），此时浏览器可能已丢失用户手势上下文而拒绝自动播放，
   * 因此被拦截时注册一次性的点击监听，用户再次点击页面即恢复播放。
   */
  async function playAudio(): Promise<void> {
    if (audioElement === null) {
      return
    }
    try {
      await audioElement.play()
      detachUserUnlockRetry()
      errorMessage.value = ''
      startLipSync()
    } catch {
      attachUserUnlockRetry()
    }
  }

  /**
   * 注册「等待用户点击后恢复播放」的一次性监听
   */
  function attachUserUnlockRetry(): void {
    if (userUnlockRetryHandler !== null) {
      return
    }
    errorMessage.value = '浏览器暂时阻止了语音播放，点击页面任意位置即可继续播放'
    userUnlockRetryHandler = () => {
      detachUserUnlockRetry()
      void playAudio()
    }
    document.addEventListener('click', userUnlockRetryHandler)
  }

  /**
   * 注销「等待用户点击后恢复播放」的监听
   */
  function detachUserUnlockRetry(): void {
    if (userUnlockRetryHandler === null) {
      return
    }
    document.removeEventListener('click', userUnlockRetryHandler)
    userUnlockRetryHandler = null
  }

  /**
   * 把收到的分片按顺序送入 SourceBuffer
   */
  function appendPendingChunks(): void {
    if (sourceBuffer === null || sourceBuffer.updating) {
      return
    }
    if (nextAppendIndex >= receivedChunks.length) {
      return
    }
    const chunk = receivedChunks[nextAppendIndex]
    nextAppendIndex += 1
    try {
      sourceBuffer.appendBuffer(chunk)
    } catch {
      // 分片损坏或缓冲区超限时放弃 MSE，改由 done 事件整段播放兜底
      handleMediaSourceFailure()
    }
  }

  /**
   * 全部分片写入完成后关闭 MSE 流
   */
  function finishMediaSource(): void {
    if (mediaSource === null || sourceBuffer === null) {
      return
    }
    if (sourceBuffer.updating || nextAppendIndex < receivedChunks.length) {
      return
    }
    if (mediaSource.readyState === 'open') {
      mediaSource.endOfStream()
    }
  }

  /**
   * MSE 写入失败：退化为整段播放，保证仍有声音输出
   */
  function handleMediaSourceFailure(): void {
    isUsingMediaSource = false
    if (audioElement !== null) {
      audioElement.pause()
      audioElement.removeAttribute('src')
    }
    if (mediaSourceUrl !== '') {
      URL.revokeObjectURL(mediaSourceUrl)
      mediaSourceUrl = ''
    }
    mediaSource = null
    sourceBuffer = null
    stopLipSync()
    if (hasReceivedDone) {
      playAllAsBlob()
    }
  }

  /**
   * 尝试以 MediaSource 实现边收边播
   */
  function startMediaSourcePlayback(): void {
    if (
      audioElement === null ||
      typeof MediaSource === 'undefined' ||
      !MediaSource.isTypeSupported(streamMimeType)
    ) {
      return
    }
    const source = new MediaSource()
    mediaSource = source
    mediaSourceUrl = URL.createObjectURL(source)
    audioElement.src = mediaSourceUrl
    isUsingMediaSource = true
    source.addEventListener(
      'sourceopen',
      () => {
        if (mediaSource === null || audioElement === null || !isUsingMediaSource) {
          return
        }
        const buffer = mediaSource.addSourceBuffer(streamMimeType)
        sourceBuffer = buffer
        buffer.addEventListener('updateend', () => {
          appendPendingChunks()
          if (hasReceivedDone) {
            finishMediaSource()
          }
        })
        buffer.addEventListener('error', handleMediaSourceFailure)
        appendPendingChunks()
        void playAudio()
      },
      { once: true }
    )
  }

  /**
   * MediaSource 不可用或写入失败时的兜底：分片全部到齐后整段播放
   */
  function playAllAsBlob(): void {
    if (audioElement === null || receivedChunks.length === 0) {
      return
    }
    const totalBytes = receivedChunks.reduce((sum, part) => sum + part.length, 0)
    const merged = new Uint8Array(totalBytes)
    let offset = 0
    for (const part of receivedChunks) {
      merged.set(part, offset)
      offset += part.length
    }
    if (mediaSourceUrl !== '') {
      URL.revokeObjectURL(mediaSourceUrl)
    }
    mediaSourceUrl = URL.createObjectURL(new Blob([merged], { type: streamMimeType }))
    audioElement.src = mediaSourceUrl
    void playAudio()
  }

  /**
   * 处理 audio 事件：缓存分片并尝试立即播放
   * @param payload audio 事件负载
   */
  function handleAudioPayload(payload: TtsAudioPayload): void {
    lastSeq = Math.max(lastSeq, payload.seq)
    receivedChunks.push(decodeBase64(payload.chunk))
    appendPendingChunks()
  }

  /**
   * 处理 meta 事件：记录合成提供方并按实际音频格式选择播放策略
   * @param payload meta 事件负载
   */
  function handleMetaPayload(payload: TtsMetaPayload): void {
    provider.value = payload.provider
    streamMimeType = payload.format === 'wav' ? MIME_AUDIO_WAV : MIME_AUDIO_MPEG
    startMediaSourcePlayback()
  }

  /**
   * 关闭 SSE 连接
   */
  function closeEventSource(): void {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    eventSource?.close()
    eventSource = null
  }

  /**
   * 断线后退避重连，并携带已收到的分片序号续传
   */
  function scheduleReconnect(): void {
    reconnectCount += 1
    const delayMs = TTS_RECONNECT_BASE_DELAY_MS * RECONNECT_BACKOFF_FACTOR ** (reconnectCount - 1)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      if (isStreaming.value) {
        openStream()
      }
    }, delayMs)
  }

  /**
   * 处理流中断或后端 error 事件
   * @param payload 后端 error 事件负载，连接级异常时为 null
   */
  function handleStreamFailure(payload: TtsErrorPayload | null): void {
    if (payload !== null) {
      errorMessage.value = payload.message
      hasReceivedDone = true
      closeEventSource()
      isStreaming.value = false
      stopLipSync()
      return
    }
    // 连接级异常：已正常收到 done 的忽略，否则退避重连续传
    if (hasReceivedDone || !isStreaming.value) {
      return
    }
    closeEventSource()
    if (reconnectCount >= TTS_MAX_RECONNECT) {
      errorMessage.value = '语音响应流中断，请重试'
      isStreaming.value = false
      stopLipSync()
      return
    }
    scheduleReconnect()
  }

  /**
   * 建立 SSE 连接并注册各事件处理
   */
  function openStream(): void {
    const source = new EventSource(buildTtsStreamUrl({ text: currentText, lastSeq }))
    eventSource = source

    source.addEventListener(SSE_EVENT_META, (event: MessageEvent) => {
      handleMetaPayload(JSON.parse(event.data) as TtsMetaPayload)
    })
    source.addEventListener(SSE_EVENT_AUDIO, (event: MessageEvent) => {
      handleAudioPayload(JSON.parse(event.data) as TtsAudioPayload)
    })
    source.addEventListener(SSE_EVENT_DONE, (event: MessageEvent) => {
      provider.value = (JSON.parse(event.data) as TtsDonePayload).provider
      hasReceivedDone = true
      closeEventSource()
      if (!isUsingMediaSource || sourceBuffer === null) {
        playAllAsBlob()
        return
      }
      appendPendingChunks()
      finishMediaSource()
    })
    source.addEventListener(SSE_EVENT_ERROR, (event: Event) => {
      // 同名事件既可来自后端下发的 error 事件，也可能是连接级异常，按类型区分处理
      if (event instanceof MessageEvent) {
        handleStreamFailure(JSON.parse(event.data) as TtsErrorPayload)
        return
      }
      handleStreamFailure(null)
    })
  }

  /**
   * 释放播放与分析资源
   */
  function releasePlayback(): void {
    detachUserUnlockRetry()
    if (audioElement !== null) {
      audioElement.pause()
      audioElement.removeAttribute('src')
    }
    if (mediaSourceUrl !== '') {
      URL.revokeObjectURL(mediaSourceUrl)
      mediaSourceUrl = ''
    }
    if (audioContext !== null) {
      void audioContext.close()
    }
    receivedChunks.length = 0
    nextAppendIndex = 0
    audioElement = null
    audioContext = null
    analyser = null
    analyserBuffer = null
    mediaSource = null
    sourceBuffer = null
    isUsingMediaSource = false
    streamMimeType = DEFAULT_STREAM_MIME
    stopLipSync()
  }

  /**
   * 请求数字人播报指定文本
   * @param text 待播报文本
   */
  function speak(text: string): void {
    // 先彻底结束上一次播报，避免多条流叠加
    stop()
    const trimmed = text.trim()
    if (trimmed === '') {
      return
    }
    currentText = trimmed
    errorMessage.value = ''
    isStreaming.value = true
    preparePlayback()
    openStream()
  }

  /**
   * 立即停止播报并释放全部资源
   */
  function stop(): void {
    closeEventSource()
    reconnectCount = 0
    lastSeq = 0
    currentText = ''
    hasReceivedDone = false
    provider.value = ''
    isStreaming.value = false
    releasePlayback()
  }

  onBeforeUnmount(stop)

  return {
    isStreaming: readonly(isStreaming),
    mouthOpen: readonly(mouthOpen),
    provider: readonly(provider),
    errorMessage: readonly(errorMessage),
    speak,
    stop
  }
}
