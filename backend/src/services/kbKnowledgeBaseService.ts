/**
 * @file 知识库业务服务
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 编排「解析 -> 分块 -> 向量化 -> 写入向量库」的完整入库链路，
 *              维护文档清单，并提供知识库检索能力。
 */

import { randomUUID } from 'node:crypto';
import {
  KB_EMBED_BATCH_SIZE,
  KB_STAGE_PERCENT,
  KbStageEnum
} from '../constants/kbConstants.js';
import { parseDocument, splitText } from './kbDocumentParser.js';
import { embedTexts } from './kbEmbeddingClient.js';
import { getVectorStore, type KbChunkRecord, type KbSearchHit } from './kbVectorStore.js';
import { createTask, updateTask } from './kbTaskStore.js';

/** 文档在知识库中的状态 */
export enum KbDocumentStatusEnum {
  /** 正在解析入库 */
  PROCESSING = 'processing',
  /** 可被检索 */
  READY = 'ready',
  /** 入库失败 */
  FAILED = 'failed'
}

/** 知识库文档元数据 */
export interface KbDocument {
  documentId: string;
  fileName: string;
  extension: string;
  filePath: string;
  sizeBytes: number;
  charCount: number;
  pageCount: number;
  chunkCount: number;
  status: KbDocumentStatusEnum;
  createdAt: number;
  updatedAt: number;
}

/** 入库请求参数 */
export interface IngestDocumentParams {
  documentId: string;
  fileName: string;
  extension: string;
  filePath: string;
  sizeBytes: number;
}

const documentMap = new Map<string, KbDocument>();

/**
 * 创建一条待入库的文档记录并返回其入库任务标识
 * @param params 入库请求参数
 * @returns 任务标识与文档记录
 */
export function registerDocument(params: IngestDocumentParams): {
  task: ReturnType<typeof createTask>;
  document: KbDocument;
} {
  const now = Date.now();
  const document: KbDocument = {
    documentId: params.documentId,
    fileName: params.fileName,
    extension: params.extension,
    filePath: params.filePath,
    sizeBytes: params.sizeBytes,
    charCount: 0,
    pageCount: 0,
    chunkCount: 0,
    status: KbDocumentStatusEnum.PROCESSING,
    createdAt: now,
    updatedAt: now
  };
  documentMap.set(document.documentId, document);

  const taskId = randomUUID();
  const task = createTask({ taskId, documentId: document.documentId, fileName: document.fileName });
  return { task, document };
}

/**
 * 查询全部知识库文档
 * @returns 按创建时间倒序排列的文档列表
 */
export function listDocuments(): KbDocument[] {
  return Array.from(documentMap.values()).sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 查询单个文档
 * @param documentId 文档标识
 * @returns 文档记录，不存在时返回 null
 */
export function getDocument(documentId: string): KbDocument | null {
  return documentMap.get(documentId) ?? null;
}

/**
 * 删除文档及其在向量库中的全部知识块
 * @param documentId 文档标识
 * @returns 是否删除成功
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const document = documentMap.get(documentId);
  if (!document) {
    return false;
  }
  await getVectorStore().deleteByDocument(documentId);
  documentMap.delete(documentId);
  return true;
}

/**
 * 重新为已入库文档建立索引
 * @param documentId 文档标识
 * @param taskId 本次重建索引的任务标识，用于向管理台推送进度
 * @returns 是否成功完成重建
 */
export async function reindexDocument(documentId: string, taskId: string): Promise<boolean> {
  const document = documentMap.get(documentId);
  if (!document) {
    return false;
  }
  await getVectorStore().deleteByDocument(documentId);
  await runIngestPipeline(document, taskId);
  return true;
}

/**
 * 知识库语义检索，供管理台自检以及成员B 的 RAG 链路复用
 * @param query 查询文本
 * @param topK 返回结果条数
 * @returns 命中的知识块列表
 */
export async function searchKnowledge(query: string, topK: number): Promise<KbSearchHit[]> {
  const [vector] = await embedTexts([query]);
  return getVectorStore().search(vector, topK);
}

/**
 * 执行完整的入库链路，并全程向任务订阅者推送进度
 * @param document 文档记录
 * @param taskId 任务标识
 */
export async function runIngestPipeline(document: KbDocument, taskId: string): Promise<void> {
  try {
    updateTask(taskId, { stage: KbStageEnum.PARSING, message: `正在解析 ${document.fileName}` });
    const parsed = await parseDocument(document.filePath, document.extension);
    document.charCount = parsed.text.length;
    document.pageCount = parsed.pageCount;

    updateTask(taskId, { stage: KbStageEnum.CHUNKING, message: '正在切分知识块' });
    const chunks = await splitText(parsed.text);
    if (chunks.length === 0) {
      throw new Error('文档内容为空，未提取到可用文本');
    }

    const store = getVectorStore();
    let processed = 0;
    for (let start = 0; start < chunks.length; start += KB_EMBED_BATCH_SIZE) {
      const batch = chunks.slice(start, start + KB_EMBED_BATCH_SIZE);
      const vectors = await embedTexts(batch);
      const records: KbChunkRecord[] = batch.map((text, offset) => ({
        id: `${document.documentId}-${start + offset}`,
        documentId: document.documentId,
        text,
        vector: vectors[offset]
      }));
      await store.upsert(records);

      processed += batch.length;
      const percent =
        KB_STAGE_PERCENT[KbStageEnum.CHUNKING] +
        Math.round(
          (KB_STAGE_PERCENT[KbStageEnum.EMBEDDING] - KB_STAGE_PERCENT[KbStageEnum.CHUNKING]) *
            (processed / chunks.length)
        );
      updateTask(taskId, {
        stage: KbStageEnum.EMBEDDING,
        message: `已向量化 ${processed}/${chunks.length} 个知识块`,
        percent,
        chunkCount: processed
      });
    }

    updateTask(taskId, {
      stage: KbStageEnum.INDEXING,
      message: `正在写入向量库（共 ${chunks.length} 个知识块）`,
      chunkCount: chunks.length
    });
    document.chunkCount = chunks.length;
    document.status = KbDocumentStatusEnum.READY;
    document.updatedAt = Date.now();

    updateTask(taskId, { stage: KbStageEnum.DONE, message: '知识库已更新，数字人可立即检索到新内容' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    document.status = KbDocumentStatusEnum.FAILED;
    document.updatedAt = Date.now();
    updateTask(taskId, { stage: KbStageEnum.FAILED, message: '文档入库失败', error: reason });
  }
}
