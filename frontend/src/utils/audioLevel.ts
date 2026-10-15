/**
 * @file 音频电平计算工具
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 把 AnalyserNode 的时域采样换算成 RMS 电平，供 VAD 断句与口型驱动复用。
 */

/** 8bit 时域数据的中心值 */
const BYTE_TIME_DOMAIN_CENTER = 128

/**
 * 计算时域采样的均方根电平
 * @param samples AnalyserNode 的 getByteTimeDomainData 结果
 * @returns 0~1 的电平值
 */
export function computeRms(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0
  }
  let sum = 0
  for (const sample of samples) {
    const centered = (sample - BYTE_TIME_DOMAIN_CENTER) / BYTE_TIME_DOMAIN_CENTER
    sum += centered * centered
  }
  return Math.sqrt(sum / samples.length)
}
