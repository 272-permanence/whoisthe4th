/**
 * @file ASR 模块的 SQLite 数据库初始化与连接管理
 * @author 第八组（成员A）
 * @date 2026-10-20
 * @description 创建 A 负责的两张表：audio_log（录音元数据）、asr_result（识别结果）。
 *              与 D 的 analytics.db 独立存放，未来 D 牵头迁移 PostgreSQL 时，
 *              本模块只需替换 getDb() 内部实现即可适配读写分离连接池。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A 的数据库文件存放在 backend/data/asr.db（与 D 的 analytics.db 分离）
const DB_PATH = path.resolve(__dirname, '../../data/asr.db');
const DB_DIR = path.dirname(DB_PATH);

let db: Database.Database | null = null;

/**
 * 获取 A 模块专属的数据库单例
 * @returns SQLite 数据库实例
 */
export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

/**
 * 初始化 A 模块的数据表（幂等，表已存在则跳过）
 * - audio_log    录音上传时立即插入的元数据记录
 * - asr_result   识别完成后插入的结果记录，request_id 外键关联 audio_log
 */
function initTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS audio_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id      TEXT    NOT NULL,
      filename        TEXT    NOT NULL,
      mime_type       TEXT,
      size_bytes      INTEGER,
      duration_ms     INTEGER,
      sampling_rate   INTEGER,
      channels        INTEGER,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audio_log_request_id
      ON audio_log(request_id);
    CREATE INDEX IF NOT EXISTS idx_audio_log_created_at
      ON audio_log(created_at);

    CREATE TABLE IF NOT EXISTS asr_result (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id      TEXT    NOT NULL,
      audio_log_id    INTEGER,
      provider        TEXT    NOT NULL,
      text            TEXT,
      duration_ms     INTEGER,
      status          TEXT    NOT NULL DEFAULT 'success',
      error_message   TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_asr_result_request_id
      ON asr_result(request_id);
    CREATE INDEX IF NOT EXISTS idx_asr_result_created_at
      ON asr_result(created_at);
    CREATE INDEX IF NOT EXISTS idx_asr_result_provider
      ON asr_result(provider);
    CREATE INDEX IF NOT EXISTS idx_asr_result_status
      ON asr_result(status);
  `);
}

/** 关闭数据库连接（用于测试或优雅退出） */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ========================== 便捷写入函数 ==========================

/** 录音日志入参（不含 request_id，调用方负责生成唯一请求 id） */
export interface AudioLogInput {
  requestId: string;
  filename: string;
  mimetype?: string;
  sizeBytes?: number;
  durationMs?: number;
  samplingRate?: number;
  channels?: number;
}

/** 识别结果入参（requestId 与 audio_log 对应，audioLogId 可为空） */
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
 * @returns 新插入行的 id
 */
export function insertAudioLog(input: AudioLogInput): number {
  const stmt = getDb().prepare(`
    INSERT INTO audio_log
      (request_id, filename, mime_type, size_bytes, duration_ms, sampling_rate, channels)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    input.requestId,
    input.filename,
    input.mimetype ?? null,
    input.sizeBytes ?? null,
    input.durationMs ?? null,
    input.samplingRate ?? null,
    input.channels ?? null
  );
  return Number(info.lastInsertRowid);
}

/**
 * 插入一条识别结果记录
 * @returns 新插入行的 id
 */
export function insertAsrResult(input: AsrResultInput): number {
  const stmt = getDb().prepare(`
    INSERT INTO asr_result
      (request_id, audio_log_id, provider, text, duration_ms, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    input.requestId,
    input.audioLogId ?? null,
    input.provider,
    input.text ?? null,
    input.durationMs ?? null,
    input.status ?? 'success',
    input.errorMessage ?? null
  );
  return Number(info.lastInsertRowid);
}
