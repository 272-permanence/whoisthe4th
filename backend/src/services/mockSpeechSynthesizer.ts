/**
 * @file 离线模拟语音合成器
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 当环境无法访问 Edge-TTS 在线服务时，按文本节奏合成一段类人声波形，
 *              保证「语音输入 → 数字人语音回答 + 口型同步」链路在断网环境仍可演示。
 *              每个字生成一段带共振峰的音节，字与字之间留出停顿，前端按音频振幅驱动口型。
 */

/** 单字音节时长（秒） */
const SYLLABLE_SECONDS = 0.16;
/** 字间停顿（秒） */
const SYLLABLE_GAP_SECONDS = 0.05;
/** 标点停顿（秒） */
const PUNCTUATION_GAP_SECONDS = 0.22;
/** 音节包络的上升段占比 */
const ATTACK_RATIO = 0.2;
/** 音节包络的下降段占比 */
const RELEASE_RATIO = 0.45;
/** 噪声成分振幅，用于增强真实感 */
const NOISE_AMPLITUDE = 0.02;
/** 第一共振峰基准频率（Hz） */
const FIRST_FORMANT_HZ = 400;
/** 第一共振峰随字符变化的步长（Hz） */
const FIRST_FORMANT_STEP_HZ = 90;
/** 第二共振峰基准频率（Hz） */
const SECOND_FORMANT_HZ = 900;
/** 第二共振峰随字符变化的步长（Hz） */
const SECOND_FORMANT_STEP_HZ = 160;
/** 第三共振峰频率（Hz） */
const THIRD_FORMANT_HZ = 2400;
/** 输出增益，避免削波 */
const OUTPUT_GAIN = 0.5;
/** 16bit PCM 的满量程值 */
const MAX_INT16 = 32767;
/** WAV 头长度（字节） */
const WAV_HEADER_BYTES = 44;
/** 位深 */
const PCM_BITS = 16;
/** 声道数：单声道 */
const CHANNEL_COUNT = 1;
/** 每字节比特数 */
const BITS_PER_BYTE = 8;
/** 视为停顿的标点集合 */
const PUNCTUATION_CHARS = new Set(['，', '。', '、', '；', '：', '？', '！', ',', '.', ';', ':', '?', '!']);
const TWO_PI = Math.PI * 2;

/**
 * 计算音节包络（升余弦淡入淡出，模拟说话时的音量起伏）
 * @param progress 音节内的时间进度，取值 0~1
 * @returns 0~1 的包络系数
 */
function buildEnvelope(progress: number): number {
  if (progress < ATTACK_RATIO) {
    return Math.sin((progress / ATTACK_RATIO) * (Math.PI / 2));
  }
  if (progress > 1 - RELEASE_RATIO) {
    return Math.sin(((1 - progress) / RELEASE_RATIO) * (Math.PI / 2));
  }
  return 1;
}

/**
 * 向采样序列追加静音
 * @param samples 采样序列（会被原地修改）
 * @param sampleRate 采样率（Hz）
 * @param seconds 静音时长（秒）
 */
function appendSilence(samples: number[], sampleRate: number, seconds: number): void {
  const total = Math.floor(sampleRate * seconds);
  for (let index = 0; index < total; index += 1) {
    samples.push(0);
  }
}

/**
 * 向采样序列追加一个类人声音节
 * @param samples 采样序列（会被原地修改）
 * @param sampleRate 采样率（Hz）
 * @param character 该音节对应的字符，用于挑选共振峰频率
 */
function appendSyllable(samples: number[], sampleRate: number, character: string): void {
  const codePoint = character.codePointAt(0) ?? 0;
  const firstFormant = FIRST_FORMANT_HZ + (codePoint % 6) * FIRST_FORMANT_STEP_HZ;
  const secondFormant = SECOND_FORMANT_HZ + (codePoint % 5) * SECOND_FORMANT_STEP_HZ;
  const total = Math.floor(sampleRate * SYLLABLE_SECONDS);
  for (let index = 0; index < total; index += 1) {
    const time = index / sampleRate;
    const envelope = buildEnvelope(index / total);
    // 三个共振峰叠加再混入少量噪声，听感接近人声
    const wave =
      Math.sin(TWO_PI * firstFormant * time) * 0.5 +
      Math.sin(TWO_PI * secondFormant * time * 1.02) * 0.3 +
      Math.sin(TWO_PI * THIRD_FORMANT_HZ * time) * 0.12 +
      (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
    const bounded = Math.max(-1, Math.min(1, wave * envelope * OUTPUT_GAIN));
    samples.push(Math.round(bounded * MAX_INT16));
  }
}

/**
 * 构造 44 字节的 WAV 文件头
 * @param dataBytes PCM 数据长度（字节）
 * @param sampleRate 采样率（Hz）
 * @returns WAV 文件头 Buffer
 */
function buildWavHeader(dataBytes: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  const bytesPerSample = PCM_BITS / BITS_PER_BYTE;
  const byteRate = sampleRate * CHANNEL_COUNT * bytesPerSample;
  header.write('RIFF', 0);
  header.writeUInt32LE(WAV_HEADER_BYTES - 8 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // 音频格式：1 表示 PCM
  header.writeUInt16LE(CHANNEL_COUNT, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(CHANNEL_COUNT * bytesPerSample, 32);
  header.writeUInt16LE(PCM_BITS, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/**
 * 依据文本合成模拟语音，输出 16bit 单声道 WAV
 * @param text 待合成文本
 * @param sampleRate 采样率（Hz）
 * @returns 完整 WAV 二进制数据
 */
export function synthesizeMockWav(text: string, sampleRate: number): Buffer {
  const characters = Array.from(text.replace(/\s+/g, ''));
  const samples: number[] = [];
  for (const character of characters) {
    if (PUNCTUATION_CHARS.has(character)) {
      appendSilence(samples, sampleRate, PUNCTUATION_GAP_SECONDS);
      continue;
    }
    appendSyllable(samples, sampleRate, character);
    appendSilence(samples, sampleRate, SYLLABLE_GAP_SECONDS);
  }
  // 兜底：空文本也产出一点音频，避免前端拿到空流
  if (samples.length === 0) {
    appendSilence(samples, sampleRate, SYLLABLE_SECONDS);
  }
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => {
    pcm.writeInt16LE(value, index * 2);
  });
  return Buffer.concat([buildWavHeader(pcm.length, sampleRate), pcm]);
}
