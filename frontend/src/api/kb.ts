/**
 * @file 知识库管理接口封装
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 封装知识库文档的上传、列表、删除、检索接口，以及解析进度的 SSE 订阅。
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/** 知识库接口前缀 */
const KB_BASE_URL = `${API_BASE_URL}/api/v1/kb`;

/** 后端统一响应结构 */
export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
}

/** 知识库文档状态 */
export type KbDocumentStatus = 'processing' | 'ready' | 'failed';

/** 知识库文档元数据 */
export interface KbDocument {
  documentId: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  charCount: number;
  pageCount: number;
  chunkCount: number;
  status: KbDocumentStatus;
  createdAt: number;
  updatedAt: number;
}

/** 解析进度事件，对应后端 event: progress */
export interface KbProgressEvent {
  percent: number;
  stage: string;
  message: string;
  chunkCount: number;
  fileName: string;
  documentId: string;
  error?: string;
}

/** 上传接口返回的数据 */
export interface KbUploadResult {
  taskId: string;
  documentId: string;
}

/** 检索命中结果 */
export interface KbSearchHit {
  id: string;
  documentId: string;
  text: string;
  score: number;
}

/**
 * 上传文档并触发后端异步入库
 * @param file 待上传的文件
 * @returns 任务标识与文档标识
 * @throws {Error} 当后端返回非成功状态时抛出
 */
export async function uploadDocument(file: File): Promise<KbUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${KB_BASE_URL}/documents`, { method: 'POST', body: formData });
  const payload = (await response.json()) as ApiResult<KbUploadResult>;
  if (payload.code !== 0) {
    throw new Error(payload.message);
  }
  return payload.data;
}

/**
 * 查询知识库文档列表
 * @returns 文档列表
 */
export async function fetchDocuments(): Promise<KbDocument[]> {
  const payload = (await (await fetch(`${KB_BASE_URL}/documents`)).json()) as ApiResult<KbDocument[]>;
  return payload.data;
}

/**
 * 删除文档及其在向量库中的知识块
 * @param documentId 文档标识
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const payload = (await (
    await fetch(`${KB_BASE_URL}/documents/${documentId}`, { method: 'DELETE' })
  ).json()) as ApiResult<null>;
  if (payload.code !== 0) {
    throw new Error(payload.message);
  }
}

/**
 * 知识库语义检索
 * @param query 查询文本
 * @param topK 返回结果条数
 * @returns 命中的知识块列表
 */
export async function searchKnowledge(query: string, topK: number): Promise<KbSearchHit[]> {
  const payload = (await (
    await fetch(`${KB_BASE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK })
    })
  ).json()) as ApiResult<KbSearchHit[]>;
  return payload.data;
}

/**
 * 订阅文档解析进度
 * @param taskId 上传接口返回的任务标识
 * @param onEvent 每次进度变化的回调
 * @param onFinish 任务结束（完成或失败）时的回调
 * @returns 取消订阅的函数
 */
export function subscribeProgress(
  taskId: string,
  onEvent: (event: KbProgressEvent) => void,
  onFinish: (event: KbProgressEvent) => void
): () => void {
  const source = new EventSource(`${KB_BASE_URL}/tasks/${taskId}/progress`);
  source.addEventListener('progress', (message) => {
    const event = JSON.parse((message as MessageEvent<string>).data) as KbProgressEvent;
    onEvent(event);
    if (event.stage === 'done' || event.stage === 'failed') {
      source.close();
      onFinish(event);
    }
  });
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
}
