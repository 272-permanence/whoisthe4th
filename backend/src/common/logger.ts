/**
 * @file 公共层：统一日志工具（支持 traceId 全链路）
 * @description 封装 info/warn/error/debug，控制台输出带时间戳 + 模块名 + traceId。
 *              通过 AsyncLocalStorage 保存当前请求的 traceId，业务代码无需手动透传。
 * @author 第八组（成员C）
 * @date 2026-11-05
 */
import { AsyncLocalStorage } from 'node:async_hooks';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
type LogHandler = (level: LogLevel, module: string, message: string) => void;

/** 全局最低输出级别，低于此级别的日志会被跳过 */
const MIN_LEVEL: LogLevel = 'INFO';

/** trace 上下文（AsyncLocalStorage 保证同一次请求内的异步调用都能拿到） */
export interface TraceContext {
  traceId: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

/** 在指定 traceId 上下文中执行（由 traceIdMiddleware 调用） */
export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceStorage.run({ traceId }, fn);
}

/** 取当前异步上下文的 traceId（不在请求上下文里返回 undefined） */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

/** 日志级别权重，用于比较是否低于 MIN_LEVEL */
function levelOrder(level: LogLevel): number {
  return { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }[level];
}

/** 控制台日志（开发/生产共用），自动带 traceId */
function consoleHandler(level: LogLevel, module: string, message: string): void {
  if (levelOrder(level) < levelOrder(MIN_LEVEL)) return;
  const ts = new Date().toISOString();
  const scope = module ? `[${module}]` : '';
  const traceId = getTraceId();
  const trace = traceId ? `[trace=${traceId}]` : '';
  const line = `${ts} [${level}]${scope}${trace} ${message}`;
  switch (level) {
    case 'ERROR': console.error(line); break;
    case 'WARN':  console.warn(line);  break;
    default:      console.log(line);   break;
  }
}

/** 预留的文件写入钩子，可在生产环境注入，默认空实现 */
export let writeToFile: LogHandler | null = null;

/**
 * 工厂函数：按模块名创建专属 logger 实例
 * @param module 模块名，如 'asr-tts'、'analytics'、'sse-broker'
 */
export function createLogger(module: string): Record<LogLevel, (msg: string) => void> {
  const emit = (level: LogLevel, msg: string) => {
    consoleHandler(level, module, msg);
    writeToFile?.(level, module, msg);
  };
  return {
    DEBUG: (m) => emit('DEBUG', m),
    INFO:  (m) => emit('INFO',  m),
    WARN:  (m) => emit('WARN',  m),
    ERROR: (m) => emit('ERROR', m)
  };
}

/**
 * 统一错误日志：记录错误信息 + 堆栈 + 附加上下文（自动带 traceId）
 * 供 process.on('uncaughtException' / 'unhandledRejection') 与 errorHandler 复用。
 * @param error 异常对象（Error 或任意抛出值）
 * @param module 模块名
 * @param extra 附加排查信息（如 path / method / ip）
 */
export function logError(error: unknown, module = 'app', extra?: Record<string, unknown>): void {
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
    : String(error);
  const suffix = extra && Object.keys(extra).length > 0 ? ` | ${JSON.stringify(extra)}` : '';
  consoleHandler('ERROR', module, `${detail}${suffix}`);
  writeToFile?.('ERROR', module, `${detail}${suffix}`);
}
