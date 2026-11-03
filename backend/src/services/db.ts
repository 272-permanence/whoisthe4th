/**
 * @file ASR 模块的数据库访问层（MySQL + mysql2）
 * @author 第八组（成员A）
 * @date 2026-10-20
 * @date 2026-11-03 迁移：从 SQLite 切换到全组统一的 MySQL 8.0（D 建表脚本 backend/sql/01_schema.sql）
 * @description A 负责的两张表：audio_log（录音元数据）、asr_result（识别结果）。
 *              表结构与 D 的 01_schema.sql 第 30-69 行 1:1 对齐，通过 B 的 utils/db.ts
 *              提供的 getDbPool() 共享连接池，不单独建连接。
 *              MySQL 未配置时自动降级为 no-op（只打 WARN，不抛异常），
 *              避免本地开发没装 MySQL 时整个 ASR 流程不可用。
 */
import { getDbPool } from '../utils/db.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('asr-db');

/** 录音日志入参 */
export interface AudioLogInput {
  requestId: string;
  filename: string;
  mimetype?: string;
  sizeBytes?: number;
  durationMs?: number;
  samplingRate?: number;
  channels?: number;
}

/** 识别结果入参 */
export interface AsrResultInput {
  requestId: string;
  audioLogId?: number;
  provider: string;
  text?: string;
  durationMs?: number;
  status?: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

/**
 * 插入一条录音元数据记录
 * @returns 新插入行的 id；MySQL 未配置时返回 0（no-op）
 */
export async function insertAudioLog(input: AudioLogInput): Promise<number> {
  try {
    const pool = getDbPool();
    const [result] = await pool.query(
      `INSERT INTO audio_log
         (request_id, filename, mime_type, size_bytes, duration_ms, sampling_rate, channels)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.requestId,
        input.filename,
        input.mimetype ?? null,
        input.sizeBytes ?? null,
        input.durationMs ?? null,
        input.samplingRate ?? null,
        input.channels ?? null
      ]
    );
    return Number((result as { insertId: number }).insertId);
  } catch (err) {
    // MySQL 未配置或连接失败时只 WARN，不影响 ASR 主流程
    log.WARN(`audio_log 写入跳过（MySQL 未就绪）: ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

/**
 * 插入一条识别结果记录
 * @returns 新插入行的 id；MySQL 未配置时返回 0（no-op）
 */
export async function insertAsrResult(input: AsrResultInput): Promise<number> {
  try {
    const pool = getDbPool();
    const [result] = await pool.query(
      `INSERT INTO asr_result
         (request_id, audio_log_id, provider, text, duration_ms, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.requestId,
        input.audioLogId ?? null,
        input.provider,
        input.text ?? null,
        input.durationMs ?? null,
        input.status ?? 'success',
        input.errorMessage ?? null
      ]
    );
    return Number((result as { insertId: number }).insertId);
  } catch (err) {
    log.WARN(`asr_result 写入跳过（MySQL 未就绪）: ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}
