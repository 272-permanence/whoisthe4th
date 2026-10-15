/**
 * @file 向量库适配层
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 对上层知识库服务屏蔽具体向量库实现。默认使用进程内内存实现，
 *              配置 QDRANT_URL 后自动切换到 Qdrant，两者共用同一套读写接口。
 */

import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { KB_COLLECTION_NAME } from '../constants/kbConstants.js';

/** 写入向量库的知识块记录 */
export interface KbChunkRecord {
  /** 知识块唯一标识 */
  id: string;
  /** 所属文档标识 */
  documentId: string;
  /** 知识块文本 */
  text: string;
  /** 向量 */
  vector: number[];
}

/** 检索命中结果 */
export interface KbSearchHit {
  id: string;
  documentId: string;
  text: string;
  /** 余弦相似度，取值 0-1 */
  score: number;
}

/** 向量库统一接口 */
export interface VectorStore {
  /** 批量写入或覆盖知识块 */
  upsert(records: KbChunkRecord[]): Promise<void>;
  /** 按向量检索最相似的知识块 */
  search(vector: number[], topK: number): Promise<KbSearchHit[]>;
  /** 删除某个文档下的全部知识块 */
  deleteByDocument(documentId: string): Promise<void>;
  /** 统计知识块总数 */
  count(): Promise<number>;
}

/**
 * 计算余弦相似度
 * @param left 向量 A
 * @param right 向量 B
 * @returns 相似度，取值 -1 到 1
 */
function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** 进程内向量库，用于未部署 Qdrant 时的本地联调 */
class MemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, KbChunkRecord>();

  public async upsert(records: KbChunkRecord[]): Promise<void> {
    records.forEach((record) => this.records.set(record.id, record));
  }

  public async search(vector: number[], topK: number): Promise<KbSearchHit[]> {
    return Array.from(this.records.values())
      .map((record) => ({
        id: record.id,
        documentId: record.documentId,
        text: record.text,
        score: cosineSimilarity(vector, record.vector)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    this.records.forEach((record, id) => {
      if (record.documentId === documentId) {
        this.records.delete(id);
      }
    });
  }

  public async count(): Promise<number> {
    return this.records.size;
  }
}

/** Qdrant HTTP 接口返回结构 */
interface QdrantSearchResponse {
  result: Array<{ id: string | number; score: number; payload: { documentId: string; text: string } | null }>;
}

/** Qdrant 向量库实现，通过 HTTP 调用，无需引入额外 SDK */
class QdrantVectorStore implements VectorStore {
  private collectionReady = false;

  public constructor(
    private readonly baseUrl: string,
    private readonly collection: string,
    private readonly dimension: number
  ) {}

  public async upsert(records: KbChunkRecord[]): Promise<void> {
    await this.ensureCollection();
    if (records.length === 0) {
      return;
    }
    await this.request(`/collections/${this.collection}/points?wait=true`, 'PUT', {
      points: records.map((record) => ({
        id: toPointId(record.id),
        vector: record.vector,
        payload: { documentId: record.documentId, text: record.text }
      }))
    });
  }

  public async search(vector: number[], topK: number): Promise<KbSearchHit[]> {
    await this.ensureCollection();
    const response = await this.request(`/collections/${this.collection}/points/search`, 'POST', {
      vector,
      limit: topK,
      with_payload: true
    });
    const payload = (await response.json()) as QdrantSearchResponse;
    return payload.result.map((hit) => ({
      id: String(hit.id),
      documentId: hit.payload?.documentId ?? '',
      text: hit.payload?.text ?? '',
      score: hit.score
    }));
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    await this.ensureCollection();
    await this.request(`/collections/${this.collection}/points/delete?wait=true`, 'POST', {
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] }
    });
  }

  public async count(): Promise<number> {
    await this.ensureCollection();
    const response = await this.request(`/collections/${this.collection}/points/count`, 'POST', {
      exact: true
    });
    const payload = (await response.json()) as { result: { count: number } };
    return payload.result.count;
  }

  /** 首次写入前确保集合存在 */
  private async ensureCollection(): Promise<void> {
    if (this.collectionReady) {
      return;
    }
    const response = await fetch(`${this.baseUrl}/collections/${this.collection}`);
    if (response.status === 404) {
      await this.request(`/collections/${this.collection}`, 'PUT', {
        vectors: { size: this.dimension, distance: 'Cosine' }
      });
    }
    this.collectionReady = true;
  }

  /** 发送 Qdrant HTTP 请求 */
  private async request(path: string, method: string, body: unknown): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Qdrant 请求失败：${method} ${path} HTTP ${response.status}`);
    }
    return response;
  }
}

/**
 * 将知识块标识转换为 Qdrant 支持的数值型 PointId
 * @param chunkId 知识块标识
 * @returns 由 md5 派生的 48 位整数
 */
function toPointId(chunkId: string): number {
  const hash = createHash('md5').update(chunkId).digest('hex').slice(0, 12);
  return Number.parseInt(hash, 16);
}

let vectorStore: VectorStore | null = null;

/**
 * 获取全局向量库实例
 * @returns 配置了 QDRANT_URL 时返回 Qdrant 实现，否则返回进程内内存实现
 */
export function getVectorStore(): VectorStore {
  if (!vectorStore) {
    vectorStore = config.qdrantUrl
      ? new QdrantVectorStore(config.qdrantUrl, KB_COLLECTION_NAME, config.embeddingDimension)
      : new MemoryVectorStore();
  }
  return vectorStore;
}
