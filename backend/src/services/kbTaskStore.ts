/**
 * @file 知识库解析任务存储（内存实现）
 * @author 第八组 成员C
 * @date 2026-10-15
 * @description 保存文档入库任务的实时进度，并向所有 SSE 订阅者广播进度变化。
 *              当前使用进程内 Map 实现，后续可替换为 Redis 以支持多实例部署。
 */

import { KbStageEnum, KB_STAGE_PERCENT } from '../constants/kbConstants.js';

/** 文档入库任务快照 */
export interface KbParseTask {
  /** 任务唯一标识，上传接口返回给前端用于建立 SSE 连接 */
  taskId: string;
  /** 关联的文档标识 */
  documentId: string;
  /** 原始文件名 */
  fileName: string;
  /** 当前阶段 */
  stage: KbStageEnum;
  /** 整体进度百分比 0-100 */
  percent: number;
  /** 面向用户的阶段说明 */
  message: string;
  /** 已生成的分块数量 */
  chunkCount: number;
  /** 失败原因，仅在阶段为 failed 时存在 */
  error?: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 最后更新时间戳（毫秒） */
  updatedAt: number;
}

/** 进度变化监听器 */
export type KbTaskListener = (task: KbParseTask) => void;

const taskMap = new Map<string, KbParseTask>();
const listenerMap = new Map<string, Set<KbTaskListener>>();

/**
 * 创建新的入库任务
 * @param task 任务初始信息，percent 与 stage 由本函数按上传阶段自动填充
 * @returns 创建完成的任务快照
 */
export function createTask(task: Pick<KbParseTask, 'taskId' | 'documentId' | 'fileName'>): KbParseTask {
  const now = Date.now();
  const created: KbParseTask = {
    ...task,
    stage: KbStageEnum.UPLOADING,
    percent: KB_STAGE_PERCENT[KbStageEnum.UPLOADING],
    message: '文件已接收，排队等待解析',
    chunkCount: 0,
    createdAt: now,
    updatedAt: now
  };
  taskMap.set(created.taskId, created);
  return created;
}

/**
 * 更新任务进度并广播给所有订阅者
 * @param taskId 任务标识
 * @param patch 需要变更的字段，percent 默认按阶段推导
 * @returns 更新后的任务快照，任务不存在时返回 null
 */
export function updateTask(
  taskId: string,
  patch: Pick<KbParseTask, 'stage' | 'message'> & Partial<Pick<KbParseTask, 'percent' | 'chunkCount' | 'error'>>
): KbParseTask | null {
  const task = taskMap.get(taskId);
  if (!task) {
    return null;
  }
  const updated: KbParseTask = {
    ...task,
    ...patch,
    percent: patch.percent ?? KB_STAGE_PERCENT[patch.stage],
    updatedAt: Date.now()
  };
  taskMap.set(taskId, updated);
  listenerMap.get(taskId)?.forEach((listener) => listener(updated));
  return updated;
}

/**
 * 查询任务快照
 * @param taskId 任务标识
 * @returns 任务快照，任务不存在时返回 null
 */
export function getTask(taskId: string): KbParseTask | null {
  return taskMap.get(taskId) ?? null;
}

/**
 * 订阅某个任务的进度变化
 * @param taskId 任务标识
 * @param listener 进度监听器
 * @returns 取消订阅的函数
 */
export function subscribeTask(taskId: string, listener: KbTaskListener): () => void {
  const listeners = listenerMap.get(taskId) ?? new Set<KbTaskListener>();
  listeners.add(listener);
  listenerMap.set(taskId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenerMap.delete(taskId);
    }
  };
}
