/**
 * @file 公共层：音频计算工具
 * @description 把 utils/audioLevel.ts 的 computeRms 和 composables 里的
 *              attack-release 平滑函数聚合到一处，VAD 断句与口型驱动复用同一份实现。
 *              常量（LIP_SYNC_ATTACK / LIP_SYNC_RELEASE / LIP_SYNC_RMS_REFERENCE）
 *              仍在 constants/interactionConstants.ts 里，这里只引用，不重复定义。
 * @author 第八组（成员A）
 * @date 2026-10-20
 */
import {
  LIP_SYNC_ATTACK,
  LIP_SYNC_RELEASE,
  LIP_SYNC_RMS_REFERENCE
} from '../constants/interactionConstants';

/** 8bit 时域数据的中心值 */
const BYTE_TIME_DOMAIN_CENTER = 128;

/**
 * 计算时域采样的均方根电平
 * @param samples AnalyserNode.getByteTimeDomainData 结果
 * @returns 0~1 的原始电平值
 */
export function computeRms(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - BYTE_TIME_DOMAIN_CENTER) / BYTE_TIME_DOMAIN_CENTER;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * 把原始 RMS 换算到 0~1 范围并做 attack-release 平滑
 *   张嘴快（attack=0.5）、闭嘴慢（release=0.18），更接近真实说话节奏
 * @param rawRms 原始 RMS 电平（来自 AnalyserNode）
 * @param current 当前平滑值（ref.value）
 * @returns 平滑后的新值，直接赋给 ref
 */
export function smoothAmplitude(rawRms: number, current: number): number {
  const target = Math.min(1, rawRms / LIP_SYNC_RMS_REFERENCE);
  const coefficient = target > current ? LIP_SYNC_ATTACK : LIP_SYNC_RELEASE;
  return current + (target - current) * coefficient;
}
