/**
 * @file 延时工具
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 提供 Promise 化的定时器，供模拟流式节奏、限流等场景复用。
 */

/**
 * 延时指定毫秒数
 * @param ms 毫秒
 * @returns 延迟完成后 resolve 的 Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
