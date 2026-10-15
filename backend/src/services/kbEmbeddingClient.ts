/**
 * @file 知识库文本向量化客户端
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 调用 BGE-M3 向量模型生成文本向量。未配置向量服务地址时退化为
 *              本地确定性伪向量，用于在无模型环境下跑通整条入库链路。
 */

import { config } from '../config.js';
import { KB_EMBEDDING_DIMENSION } from '../constants/kbConstants.js';

/** OpenAI 兼容向量接口的返回结构 */
interface EmbeddingApiResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * 批量生成文本向量
 * @param texts 待向量化的文本数组
 * @returns 与输入等长的向量数组
 * @throws {Error} 当向量服务返回异常时抛出
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  if (config.embeddingApiUrl) {
    return embedByApi(texts);
  }
  return texts.map((text) => embedLocally(text));
}

/**
 * 通过远程向量服务生成向量
 * @param texts 待向量化的文本数组
 * @returns 向量数组
 */
async function embedByApi(texts: string[]): Promise<number[][]> {
  const response = await fetch(config.embeddingApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.embeddingApiKey}`
    },
    body: JSON.stringify({ model: config.embeddingModel, input: texts })
  });

  if (!response.ok) {
    throw new Error(`向量服务调用失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as EmbeddingApiResponse;
  return payload.data.map((item) => item.embedding);
}

/**
 * 本地确定性伪向量：仅用于离线联调，不具备语义检索能力
 * @param text 待向量化文本
 * @returns 长度为 KB_EMBEDDING_DIMENSION 的向量
 */
function embedLocally(text: string): number[] {
  const vector = new Array<number>(KB_EMBEDDING_DIMENSION).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const slot = (text.charCodeAt(index) * (index + 1)) % KB_EMBEDDING_DIMENSION;
    vector[slot] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
