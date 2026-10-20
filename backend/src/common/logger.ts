/**
 * @file 公共层：统一日志工具
 * @description 封装 info/warn/error/debug，控制台输出带时间戳 + 模块名，
 *              生产环境可扩展为写文件（留钩子 writeToFile）。
 * @author 第八组（成员A）
 * @date 2026-10-20
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
type LogHandler = (level: LogLevel, module: string, message: string) => void;

/** 全局最低输出级别，低于此级别的日志会被跳过。生产环境建议调到 INFO 或 WARN */
const MIN_LEVEL: LogLevel = 'INFO';

/** 日志级别权重，用于比较是否低于 MIN_LEVEL */
function levelOrder(level: LogLevel): number {
  return { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }[level];
}

/** 控制台日志（开发/生产共用） */
function consoleHandler(level: LogLevel, module: string, message: string): void {
  if (levelOrder(level) < levelOrder(MIN_LEVEL)) return;
  const ts = new Date().toISOString();
  const scope = module ? `[${module}]` : '';
  const line = `${ts} [${level}]${scope} ${message}`;
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
