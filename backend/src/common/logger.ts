/**
 * @file 公共层：统一日志工具（Pino 实现）
 * @description 封装 info/warn/error/debug，保持 `createLogger(module)` 的工厂签名不变，
 *              内部使用 Pino 结构化 JSON 日志。开发环境 pino-pretty 打印到 console，
 *              生产环境异步写入 backend/logs/app.log。支持 C 的 traceId 中间件通过
 *              `extendContext` 注入全链路追踪 ID，所有后续日志自动携带。
 * @author 第八组（成员A 原实现 / 成员B 重写为 Pino）
 * @date 2026-10-20（原）/ 2026-11-09（重写）
 */
import pino, { type Logger, type LogDescriptor } from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 日志目录（backend/logs），自动创建 */
const LOG_DIR = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** 当前运行环境，来自 NODE_ENV 或默认 development */
const isProduction = process.env.NODE_ENV === 'production';

/** 全局最低输出级别 */
const MIN_LEVEL = isProduction ? 'info' : 'debug';

/**
 * Root Pino 实例
 * - 开发环境：pino-pretty 结构化格式化输出到 console
 * - 生产环境：JSON 写入文件 + 保留 console 输出（方便运维排查）
 */
const rootLogger: Logger = isProduction
  ? pino({ level: MIN_LEVEL, base: null, timestamp: pino.stdTimeFunctions.isoTime }, pino.destination({
      dest: path.join(LOG_DIR, 'app.log'),
      sync: false
    }))
  : pino({
      level: MIN_LEVEL,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss SSS', ignore: 'pid,hostname,module' }
      }
    });

/** 全局子 logger（通过 extendContext 注入 traceId 等全链路字段） */
let contextLogger: Logger = rootLogger;

/**
 * 注入全链路上下文（traceId 等），C 的 traceId 中间件会调这个方法
 * @param ctx 要注入的上下文对象，比如 { traceId: 'uuid-xxx' }
 */
export function extendContext(ctx: Record<string, unknown>): void {
  contextLogger = rootLogger.child(ctx);
}

/**
 * 拿到当前带上下文的根 logger 实例（供 errorLogger 等需要直接调用 Pino 结构化日志的模块使用）
 */
export function getLoggerInstance(): Logger {
  return contextLogger;
}

/**
 * Logger 接口，保持与原 createLogger 返回值完全一致的四个级别方法
 */
export interface ModuleLogger {
  DEBUG: (msg: string) => void;
  INFO: (msg: string) => void;
  WARN: (msg: string) => void;
  ERROR: (msg: string) => void;
}

/**
 * 工厂函数：按模块名创建专属 logger 实例
 * @param module 模块名，如 'poi-service'、'auth'、'sse-broker'
 */
export function createLogger(module: string): ModuleLogger {
  const child = contextLogger.child({ module });
  return {
    DEBUG: (msg: string) => child.debug(msg),
    INFO:  (msg: string) => child.info(msg),
    WARN:  (msg: string) => child.warn(msg),
    ERROR: (msg: string) => child.error(msg)
  };
}

/** 日志描述符类型，供 errorLogger 等需要写结构化错误日志的模块使用 */
export type { LogDescriptor };
