/**
 * @file 知识库管理路由
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 提供文档上传、解析进度 SSE 推送、知识库 CRUD 与语义检索接口。
 *              接口前缀：/api/v1/kb
 */

import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import {
  KB_MAX_UPLOAD_BYTES,
  KB_SSE_EVENT_PROGRESS,
  KB_SSE_HEARTBEAT_MS,
  KB_SUPPORTED_EXTENSIONS,
  KB_UPLOAD_DIR_NAME,
  KbStageEnum
} from '../constants/kbConstants.js';
import { getTask, subscribeTask, type KbParseTask } from '../services/kbTaskStore.js';
import {
  deleteDocument,
  listDocuments,
  registerDocument,
  reindexDocument,
  runIngestPipeline,
  searchKnowledge
} from '../services/kbKnowledgeBaseService.js';

const router = Router();

/**
 * 归一化路由参数，Express 5 的 params 值类型为 string | string[]
 * @param value 原始路由参数值
 * @returns 单个字符串形式的参数值
 */
function normalizeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/** 上传文件落盘目录：backend/uploads */
const uploadDir = fileURLToPath(new URL(`../../${KB_UPLOAD_DIR_NAME}`, import.meta.url));
mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => {
      callback(null, `${Date.now()}-${randomUUID()}${extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: KB_MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).slice(1).toLowerCase();
    if (!KB_SUPPORTED_EXTENSIONS.includes(extension as (typeof KB_SUPPORTED_EXTENSIONS)[number])) {
      callback(new Error(`不支持的文件类型：.${extension}`));
      return;
    }
    callback(null, true);
  }
});

/**
 * 上传文档并触发异步入库
 * POST /api/v1/kb/documents
 */
router.post('/documents', upload.single('file'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ code: 400, message: '未接收到文件，请使用 form-data 字段名 file' });
    return;
  }

  const { task, document } = registerDocument({
    documentId: randomUUID(),
    fileName: file.originalname,
    extension: extname(file.originalname).slice(1).toLowerCase(),
    filePath: file.path,
    sizeBytes: file.size
  });

  // 入库耗时较长，先返回任务标识，前端据此建立 SSE 连接
  void runIngestPipeline(document, task.taskId);

  res.status(202).json({
    code: 0,
    message: '文件已接收，正在后台解析',
    data: { taskId: task.taskId, documentId: document.documentId }
  });
});

/**
 * 查询入库任务快照
 * GET /api/v1/kb/tasks/:taskId
 */
router.get('/tasks/:taskId', (req: Request, res: Response) => {
  const task = getTask(normalizeParam(req.params.taskId));
  if (!task) {
    res.status(404).json({ code: 404, message: '任务不存在或已过期' });
    return;
  }
  res.json({ code: 0, message: 'ok', data: task });
});

/**
 * 订阅入库进度（SSE）
 * GET /api/v1/kb/tasks/:taskId/progress
 * 事件格式：event: progress / data: {"percent":45,"stage":"chunking"}
 */
router.get('/tasks/:taskId/progress', (req: Request, res: Response) => {
  const taskId = normalizeParam(req.params.taskId);
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ code: 404, message: '任务不存在或已过期' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', config.frontendUrl);

  let finished = false;
  const push = (snapshot: KbParseTask): void => {
    if (finished) {
      return;
    }
    const data = {
      percent: snapshot.percent,
      stage: snapshot.stage,
      message: snapshot.message,
      chunkCount: snapshot.chunkCount,
      fileName: snapshot.fileName,
      documentId: snapshot.documentId,
      error: snapshot.error
    };
    res.write(`event: ${KB_SSE_EVENT_PROGRESS}\ndata: ${JSON.stringify(data)}\n\n`);

    if (snapshot.stage === KbStageEnum.DONE || snapshot.stage === KbStageEnum.FAILED) {
      finished = true;
      unsubscribe();
      res.end();
    }
  };

  const unsubscribe = subscribeTask(taskId, push);
  // 心跳包保持连接，避免代理超时断开
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), KB_SSE_HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    finished = true;
  });

  push(task);
});

/**
 * 查询知识库文档列表
 * GET /api/v1/kb/documents
 */
router.get('/documents', (_req: Request, res: Response) => {
  res.json({ code: 0, message: 'ok', data: listDocuments() });
});

/**
 * 删除文档及其向量
 * DELETE /api/v1/kb/documents/:documentId
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  const removed = await deleteDocument(normalizeParam(req.params.documentId));
  if (!removed) {
    res.status(404).json({ code: 404, message: '文档不存在' });
    return;
  }
  res.json({ code: 0, message: '文档已删除' });
});

/**
 * 重建文档索引
 * POST /api/v1/kb/documents/:documentId/reindex
 */
router.post('/documents/:documentId/reindex', async (req: Request, res: Response) => {
  const documentId = normalizeParam(req.params.documentId);
  const document = listDocuments().find((item) => item.documentId === documentId);
  if (!document) {
    res.status(404).json({ code: 404, message: '文档不存在' });
    return;
  }
  // 复用上传任务的进度通道：先建任务再执行，保证前端能立刻建立 SSE 连接
  const { task } = registerDocument({
    documentId,
    fileName: document.fileName,
    extension: document.extension,
    filePath: document.filePath,
    sizeBytes: document.sizeBytes
  });
  void reindexDocument(documentId, task.taskId);
  res.status(202).json({ code: 0, message: '已开始重建索引', data: { taskId: task.taskId, documentId } });
});

/**
 * 知识库语义检索（联调自检 / 供成员B 的 RAG 复用）
 * POST /api/v1/kb/search
 */
router.post('/search', async (req: Request, res: Response) => {
  const { query, topK } = (req.body ?? {}) as { query?: string; topK?: number };
  if (!query) {
    res.status(400).json({ code: 400, message: 'query 不能为空' });
    return;
  }
  const hits = await searchKnowledge(query, topK ?? 5);
  res.json({ code: 0, message: 'ok', data: hits });
});

/**
 * 统一处理 multer 抛出的上传异常
 */
router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ code: 413, message: `文件超过 ${KB_MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限` });
    return;
  }
  res.status(400).json({ code: 400, message: error.message });
});

export default router;
