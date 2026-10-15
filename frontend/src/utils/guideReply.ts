/**
 * @file 数字人回答生成接缝
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 成员A 只负责「语音识别 → 语音播报」链路，回答内容目前使用本地模板占位。
 *              成员B 接入 RAG + LLM 后，只需把本函数替换为「调用 /api/v1/chat 流式接口」，
 *              其余语音链路（识别、断句、合成、口型同步）无需任何改动。
 *
 *              成员B 已实现：调用后端 SSE 流式接口获取 LLM 回答，按分句回调支持边生成边播报。
 */

import { API_BASE_URL } from '../constants/apiConstants'

/** 后端 SSE 事件类型 */
const SSE_EVENT_TOKEN = 'token'
const SSE_EVENT_DONE = 'done'
const SSE_EVENT_ERROR = 'error'

/**
 * 分句回调：每当 LLM 生成一个完整句子时触发
 * @param sentence 当前生成的完整句子
 * @param fullText 截至目前的完整文本
 */
export type SentenceCallback = (sentence: string, fullText: string) => void

/**
 * 从 SSE 流中解析事件
 * @param chunk 原始文本块
 * @returns 解析出的事件列表
 */
function parseSseChunk(chunk: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = []
  let event = ''
  let data = ''

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim()
    } else if (line === '' && event !== '' && data !== '') {
      events.push({ event, data })
      event = ''
      data = ''
    }
  }

  // 处理最后一个可能不完整的事件
  if (event !== '' && data !== '') {
    events.push({ event, data })
  }

  return events
}

/**
 * 把文本按中文分句规则拆分为句子
 * @param text 待拆分文本
 * @returns 句子数组
 */
export function splitSentences(text: string): string[] {
  // 中文分句：以 。！？；\n 为界，保留标点
  const raw = text.split(/(?<=[。！？；\n])/)
  return raw.map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * 生成数字人对用户提问的回答文本（流式版本）
 *
 * 调用成员B的 /api/v1/chat/stream SSE 接口，逐 token 接收回答，
 * 每凑够一个完整句子就通过 onSentence 回调通知外部（供 TTS 播报）。
 *
 * @param question 用户提问（可来自语音识别结果或文字输入）
 * @param onSentence 分句回调，每生成一个完整句子时触发
 * @param onError 错误回调
 * @returns 完整回答文本（Promise 在流结束时 resolve）
 */
export async function buildGuideReply(
  question: string,
  onSentence?: SentenceCallback,
  onError?: (error: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: question })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('无法读取响应流')
        }

        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let fullText = ''
        let lastSentenceEnd = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // 按 SSE 事件边界解析（以 \n\n 分隔）
          let boundary: number
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const eventChunk = buffer.slice(0, boundary).trim()
            buffer = buffer.slice(boundary + 2)

            if (eventChunk === '' || eventChunk.startsWith(':')) continue

            for (const { event, data } of parseSseChunk(eventChunk)) {
              try {
                const json = JSON.parse(data)

                if (event === SSE_EVENT_TOKEN) {
                  fullText += json.content

                  // 检查是否有新句子完成
                  if (onSentence) {
                    const sentences = splitSentences(fullText.slice(lastSentenceEnd))
                    if (sentences.length > 0) {
                      const lastChar = fullText.slice(-1)
                      // 当前文本以标点结尾，说明有完整句子
                      if (/[。！？；\n]/.test(lastChar)) {
                        const newSentence = fullText.slice(lastSentenceEnd)
                        lastSentenceEnd = fullText.length
                        onSentence(newSentence, fullText)
                      }
                    }
                  }
                } else if (event === SSE_EVENT_DONE) {
                  // 流结束，如果有 fullContent 则以它为准
                  if (json.fullContent) {
                    fullText = json.fullContent
                  }
                  // 处理最后未完成的句子
                  if (onSentence && lastSentenceEnd < fullText.length) {
                    const remaining = fullText.slice(lastSentenceEnd)
                    if (remaining.trim().length > 0) {
                      onSentence(remaining, fullText)
                    }
                  }
                  resolve(fullText)
                  return
                } else if (event === SSE_EVENT_ERROR) {
                  const errMsg = json.message || '服务出错'
                  onError?.(errMsg)
                  reject(new Error(errMsg))
                  return
                }
              } catch {
                // 忽略无法解析的 JSON 行
              }
            }
          }
        }

        // 流意外结束（未收到 done）
        resolve(fullText)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : '网络请求失败'
        onError?.(errMsg)
        reject(error instanceof Error ? error : new Error(errMsg))
      }
    })()
  })
}

/**
 * 兼容旧版同步调用（已废弃，仅保留用于编译兼容）
 * @deprecated 请使用流式版本 buildGuideReply(question, onSentence, onError)
 */
export function buildGuideReplySync(question: string): string {
  return `收到你的问题：「${question}」。我是西湖景区导览数字人小导，很高兴为你服务。`
}
