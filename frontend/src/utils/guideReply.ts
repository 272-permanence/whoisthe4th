/**
 * @file 数字人回答生成接缝
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 成员A 只负责「语音识别 → 语音播报」链路，回答内容目前使用本地模板占位。
 *              成员B 接入 RAG + LLM 后，只需把本函数替换为「调用 /api/v1/chat 流式接口」，
 *              其余语音链路（识别、断句、合成、口型同步）无需任何改动。
 */
import { GUIDE_REPLY_QUESTION_PLACEHOLDER, GUIDE_REPLY_TEMPLATE } from '../constants/interactionConstants'

/**
 * 生成数字人对用户提问的回答文本
 * @param question 用户提问（可来自语音识别结果或文字输入）
 * @returns 数字人需要播报的回答文本
 */
export function buildGuideReply(question: string): string {
  return GUIDE_REPLY_TEMPLATE.replace(GUIDE_REPLY_QUESTION_PLACEHOLDER, question)
}
