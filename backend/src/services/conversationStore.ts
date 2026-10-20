/**
 * @file 对话历史 + RAG 引用来源的 MySQL 持久化
 * @author 第八组（成员B）
 * @date 2026-10-20
 * @description 封装 conversation / rag_source 两张表的 CRUD。
 *              MySQL 不可用时（未装、未配置）自动降级为内存存储，chat 路由不会崩。
 */

import { randomUUID } from 'node:crypto';
import { getDbPool } from '../utils/db.js';

/** 一条对话记录 */
export interface ConversationRow {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ragUsed: boolean;
  createdAt: Date;
}

/** 一条 RAG 引用来源 */
export interface RagSourceRow {
  id?: number;
  convId: number;
  docName: string;
  snippet: string;
  score?: number;
}

/** 内存回退存储（MySQL 不可用时用） */
const memoryFallback: ConversationRow[] = [];

/**
 * 生成唯一会话 ID（前端没有 sessionId 时自动生成）
 */
export function newSessionId(): string {
  return randomUUID();
}

/**
 * 保存一条消息到 conversation 表
 * @returns 插入的自增 ID（MySQL 可用时）或 -1（内存回退）
 */
export async function saveConversation(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  ragUsed = false
): Promise<number> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      'INSERT INTO conversation (session_id, role, content, rag_used) VALUES (?, ?, ?, ?)',
      [sessionId, role, content, ragUsed ? 1 : 0]
    );
    return (rows as { insertId: number }).insertId;
  } catch (err) {
    // MySQL 不可用时降级为内存
    const row: ConversationRow = {
      id: -1,
      sessionId,
      role,
      content,
      ragUsed,
      createdAt: new Date()
    };
    memoryFallback.push(row);
    console.warn('[conversation-store] MySQL 不可用，降级内存存储。', err instanceof Error ? err.message : err);
    return -1;
  }
}

/**
 * 批量保存 RAG 引用来源
 * @param convId conversation 表的自增 ID（如果 MySQL 不可用则跳过）
 */
export async function saveRagSources(convId: number, sources: RagSourceRow[]): Promise<void> {
  if (convId <= 0 || sources.length === 0) return;

  try {
    const pool = getDbPool();
    const values = sources.map(s => [convId, s.docName, s.snippet, s.score ?? null]);
    await pool.query(
      'INSERT INTO rag_source (conv_id, doc_name, snippet, score) VALUES ?',
      [values]
    );
  } catch (err) {
    console.warn('[conversation-store] rag_source 保存失败（可能 MySQL 未配置）：', err instanceof Error ? err.message : err);
  }
}

/**
 * 查询某个会话的全部历史（供多轮对话上下文用）
 */
export async function loadSessionHistory(sessionId: string): Promise<ConversationRow[]> {
  try {
    const pool = getDbPool();
    const [rows] = await pool.execute(
      'SELECT id, session_id, role, content, rag_used, created_at FROM conversation WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    );
    return (rows as ConversationRow[]).map(r => ({
      id: r.id,
      sessionId: r.sessionId,
      role: r.role,
      content: r.content,
      ragUsed: Boolean(r.ragUsed),
      createdAt: new Date(r.createdAt)
    }));
  } catch {
    // MySQL 不可用时返回空
    return [];
  }
}
