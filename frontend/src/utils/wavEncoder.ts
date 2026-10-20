/**
 * @file WAV 编码工具
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 把浏览器 MediaRecorder 产出的 webm/mp4 录音统一转成 16kHz 单声道 16bit WAV，
 *              让后端无论使用远程 Whisper 接口还是本地 Whisper 都能直接识别。
 */

/** 目标采样率：Whisper 系列模型按 16kHz 单声道处理 */
const TARGET_SAMPLE_RATE = 16_000
/** 16bit PCM 的最大幅值 */
const MAX_INT16 = 32_767
/** WAV 头部长度（字节） */
const WAV_HEADER_BYTES = 44
/** PCM 位深 */
const PCM_BITS = 16
/** 声道数：单声道 */
const CHANNEL_COUNT = 1
/** 每字节比特数 */
const BITS_PER_BYTE = 8

/**
 * 向 DataView 写入 ASCII 字符串
 * @param view 目标视图
 * @param offset 起始偏移
 * @param text 内容
 */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

/**
 * 把浮点采样打包成 WAV Blob
 * @param samples 取值 -1~1 的单声道采样
 * @param sampleRate 采样率（Hz）
 * @returns WAV 格式 Blob
 */
function buildWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = PCM_BITS / BITS_PER_BYTE
  const dataBytes = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // 音频格式：1 表示 PCM
  view.setUint16(22, CHANNEL_COUNT, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * CHANNEL_COUNT * bytesPerSample, true)
  view.setUint16(32, CHANNEL_COUNT * bytesPerSample, true)
  view.setUint16(34, PCM_BITS, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  samples.forEach((sample, index) => {
    const bounded = Math.max(-1, Math.min(1, sample))
    view.setInt16(WAV_HEADER_BYTES + index * bytesPerSample, Math.round(bounded * MAX_INT16), true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 将录音数据编码为 16kHz 单声道 16bit WAV
 * @param blob MediaRecorder 产出的录音数据
 * @returns WAV Blob，可直接作为 multipart 字段上传
 * @throws {Error} 浏览器无法解码该录音格式时抛出
 */
export async function encodeToWav16kMono(blob: Blob): Promise<Blob> {
  if (blob.size === 0) {
    throw new Error('录音数据为空')
  }
  const arrayBuffer = await blob.arrayBuffer()
  const decodeContext = new AudioContext()
  try {
    const decoded = await decodeContext.decodeAudioData(arrayBuffer)
    // 使用离线上下文完成重采样与单声道下混，比手写线性插值更可靠
    const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE))
    const offlineContext = new OfflineAudioContext(CHANNEL_COUNT, frameCount, TARGET_SAMPLE_RATE)
    const source = offlineContext.createBufferSource()
    source.buffer = decoded
    source.connect(offlineContext.destination)
    source.start()
    const rendered = await offlineContext.startRendering()
    return buildWavBlob(rendered.getChannelData(0), TARGET_SAMPLE_RATE)
  } finally {
    await decodeContext.close()
  }
}
