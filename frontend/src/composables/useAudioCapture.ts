/**
 * @file 语音采集与 VAD 组合式函数
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 基于 MediaRecorder 采集麦克风音频，基于 Web Audio API 做实时电平检测与静音自动断句（VAD），
 *              停止录音后统一编码为 16kHz 单声道 WAV 并回调上层，用于上传后端做语音识别。
 */
import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import {
  LEVEL_DISPLAY_RMS_MAX,
  MAX_RECORDING_MS,
  VAD_SAMPLE_INTERVAL_MS,
  VAD_SILENCE_STOP_MS,
  VAD_SPEECH_RMS_THRESHOLD
} from '../constants/interactionConstants'
import type { VadState } from '../types/interaction'
import { computeRms } from '../utils/audioLevel'
import { encodeToWav16kMono } from '../utils/wavEncoder'

/** 语音采集参数 */
export interface AudioCaptureOptions {
  /** 采集结束（用户停止说话或手动停止）后回调，参数为编码好的 WAV */
  onSpeechEnd: (wav: Blob) => void | Promise<void>
}

/** 语音采集控制器 */
export interface AudioCaptureController {
  /** 是否正在录音 */
  isRecording: Readonly<Ref<boolean>>
  /** VAD 状态：idle 空闲 / silence 静音 / speech 检测到说话 */
  vadState: Readonly<Ref<VadState>>
  /** 实时音量电平 0~1，用于渲染电平条 */
  level: Readonly<Ref<number>>
  /** 错误提示 */
  errorMessage: Readonly<Ref<string>>
  /** 开始录音（需在用户手势中调用，否则浏览器会拒绝麦克风权限） */
  startRecording: () => Promise<void>
  /** 停止录音并提交识别 */
  stopRecording: () => Promise<void>
  /** 释放全部采集资源 */
  dispose: () => void
}

/** 优先使用的录音编码格式，按浏览器支持情况回退 */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
/** AnalyserNode 的 FFT 大小 */
const ANALYSER_FFT_SIZE = 1024

/**
 * 挑选当前浏览器支持的录音格式
 * @returns 支持的 MIME 类型，均不支持时返回 undefined（交给浏览器自行决定）
 */
function pickRecorderMimeType(): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

/**
 * 语音采集与 VAD 组合式函数
 * @param options 采集参数，包含采集结束后的回调
 * @returns 采集控制器
 */
export function useAudioCapture(options: AudioCaptureOptions): AudioCaptureController {
  const isRecording = ref(false)
  const vadState = ref<VadState>('idle')
  const level = ref(0)
  const errorMessage = ref('')

  let mediaRecorder: MediaRecorder | null = null
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let analyserBuffer: Uint8Array<ArrayBuffer> | null = null
  let vadTimer: number | null = null
  let recordedChunks: Blob[] = []
  let hasDetectedSpeech = false
  let lastSpeechAt = 0
  let recordingStartedAt = 0
  let isStopping = false

  /**
   * 释放采集相关资源并复位状态
   */
  function releaseResources(): void {
    if (vadTimer !== null) {
      window.clearInterval(vadTimer)
      vadTimer = null
    }
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null
    mediaRecorder = null
    analyser = null
    analyserBuffer = null
    if (audioContext !== null) {
      void audioContext.close()
      audioContext = null
    }
    level.value = 0
    vadState.value = 'idle'
    isRecording.value = false
  }

  /**
   * VAD 电平检测：检测说话、静音自动断句与录音超时保护
   */
  function runVadTick(): void {
    if (analyser === null || analyserBuffer === null) {
      return
    }
    analyser.getByteTimeDomainData(analyserBuffer)
    const rms = computeRms(analyserBuffer)
    level.value = Math.min(1, rms / LEVEL_DISPLAY_RMS_MAX)

    const now = Date.now()
    if (rms >= VAD_SPEECH_RMS_THRESHOLD) {
      hasDetectedSpeech = true
      lastSpeechAt = now
      vadState.value = 'speech'
      return
    }
    if (hasDetectedSpeech) {
      vadState.value = 'silence'
    }
    const silenceReachedEnd = hasDetectedSpeech && now - lastSpeechAt >= VAD_SILENCE_STOP_MS
    const reachedMaxDuration = now - recordingStartedAt >= MAX_RECORDING_MS
    if (!silenceReachedEnd && !reachedMaxDuration) {
      return
    }
    if (!hasDetectedSpeech) {
      errorMessage.value = '未检测到有效语音，请靠近麦克风后重试'
    }
    void stopRecording()
  }

  /**
   * 开始录音
   * @throws 不会抛出异常，麦克风异常会记录到 errorMessage
   */
  async function startRecording(): Promise<void> {
    if (isRecording.value) {
      return
    }
    errorMessage.value = ''
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
      // 采集流同时接入 Web Audio 分析节点，用于实时电平与 VAD 判断
      audioContext = new AudioContext()
      const sourceNode = audioContext.createMediaStreamSource(mediaStream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = ANALYSER_FFT_SIZE
      sourceNode.connect(analyser)
      analyserBuffer = new Uint8Array(analyser.fftSize)

      const mimeType = pickRecorderMimeType()
      mediaRecorder = mimeType === undefined ? new MediaRecorder(mediaStream) : new MediaRecorder(mediaStream, { mimeType })
      recordedChunks = []
      mediaRecorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data)
        }
      })
      mediaRecorder.start()

      hasDetectedSpeech = false
      lastSpeechAt = 0
      recordingStartedAt = Date.now()
      isRecording.value = true
      vadState.value = 'silence'
      vadTimer = window.setInterval(runVadTick, VAD_SAMPLE_INTERVAL_MS)
    } catch (error) {
      errorMessage.value = error instanceof Error ? `无法访问麦克风：${error.message}` : '无法访问麦克风'
      releaseResources()
    }
  }

  /**
   * 停止录音：编码为 WAV 后交给上层做语音识别
   */
  async function stopRecording(): Promise<void> {
    const recorder = mediaRecorder
    if (recorder === null || recorder.state === 'inactive' || isStopping) {
      return
    }
    isStopping = true
    const detectedSpeech = hasDetectedSpeech
    const recordedChunksSnapshot = recordedChunks
    const blob = await new Promise<Blob>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          resolve(new Blob(recordedChunksSnapshot, { type: recorder.mimeType }))
        },
        { once: true }
      )
      recorder.stop()
    })
    releaseResources()
    isStopping = false
    if (!detectedSpeech) {
      return
    }
    try {
      const wav = await encodeToWav16kMono(blob)
      await options.onSpeechEnd(wav)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '录音处理失败'
    }
  }

  /**
   * 释放全部资源
   */
  function dispose(): void {
    releaseResources()
  }

  onBeforeUnmount(dispose)

  return {
    isRecording: readonly(isRecording),
    vadState: readonly(vadState),
    level: readonly(level),
    errorMessage: readonly(errorMessage),
    startRecording,
    stopRecording,
    dispose
  }
}
