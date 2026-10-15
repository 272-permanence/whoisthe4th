/**
 * @file 知识库模块常量定义
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 统一维护知识库上传、解析、分块、向量化链路中使用的阶段枚举与默认参数
 */

/**
 * 文档入库阶段枚举
 * 前端管理台据此渲染 SSE 进度条，禁止在代码中出现裸字符串阶段名
 */
export enum KbStageEnum {
  /** 文件已上传，等待解析 */
  UPLOADING = 'uploading',
  /** 解析 PDF / Word / 文本 */
  PARSING = 'parsing',
  /** 文本分块 */
  CHUNKING = 'chunking',
  /** 调用向量模型生成向量 */
  EMBEDDING = 'embedding',
  /** 写入向量数据库 */
  INDEXING = 'indexing',
  /** 全部完成 */
  DONE = 'done',
  /** 处理失败 */
  FAILED = 'failed'
}

/**
 * 各阶段对应的整体进度百分比
 * 用于向前端推送 `data: {"percent":45,"stage":"chunking"}`
 */
export const KB_STAGE_PERCENT: Record<KbStageEnum, number> = {
  [KbStageEnum.UPLOADING]: 2,
  [KbStageEnum.PARSING]: 30,
  [KbStageEnum.CHUNKING]: 50,
  [KbStageEnum.EMBEDDING]: 80,
  [KbStageEnum.INDEXING]: 95,
  [KbStageEnum.DONE]: 100,
  [KbStageEnum.FAILED]: 0
};

/** SSE 进度事件名，必须固定为 progress，与前端约定一致 */
export const KB_SSE_EVENT_PROGRESS = 'progress';

/** SSE 心跳间隔（毫秒），防止代理超时断开 */
export const KB_SSE_HEARTBEAT_MS = 15_000;

/** BGE-M3 向量维度，与成员B 的 RAG 检索必须保持一致 */
export const KB_EMBEDDING_DIMENSION = 1024;

/** 默认分块大小（字符数） */
export const KB_CHUNK_SIZE = 800;

/** 默认分块重叠长度（字符数） */
export const KB_CHUNK_OVERLAP = 120;

/** 每批向量化 / 写入的知识块数量，用于在长文档处理时持续回报进度 */
export const KB_EMBED_BATCH_SIZE = 32;

/** 允许上传的文件扩展名 */
export const KB_SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'] as const;

/** 上传文件体积上限：50MB */
export const KB_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** 上传文件落盘的临时目录名（位于 backend 根目录下） */
export const KB_UPLOAD_DIR_NAME = 'uploads';

/** 向量库集合名，与成员B 共用同一个集合 */
export const KB_COLLECTION_NAME = 'scenic_knowledge';
