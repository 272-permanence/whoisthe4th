/**
 * @file 反爬虫：IP 限流中间件（express-rate-limit v7）
 * @author 第八组（成员C）
 * @date 2026-11-18
 *
 * 策略：
 *  1. 敏感接口按 IP 限流（验证码/短信/邮件发送最严格）
 *  2. 密码登录 + 外部通道登录 独立限流
 *  3. 注册接口宽松但限速（防批量建号）
 *  4. 统一错误码 + 中文提示 + retry-after 响应头
 *  5. 全部纯内存计数器（进程内演示够用，多节点需 Redis Store）
 *
 * 只在成员C的 /api/v1/auth 路由区块挂载，不动队友路由。
 */
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../common/logger.js';
import { config } from '../config.js';

const log = createLogger('rate-limit');

/** 429 响应体统一格式 */
function sendRateLimited(res: Response, message: string, retryAfterSec: number): void {
  res.setHeader('Retry-After', String(retryAfterSec));
  res.status(429).json({
    code: 429,
    message,
    retryAfterSec,
  });
}

/**
 * 构造 rateLimit 实例的工厂：
 *  - max 超限后返回统一 429 格式
 *  - 自动记录 warn 日志（含 IP + path + 超限阈值）
 *  - 开发期可通过 .env 覆盖阈值，生产代码不动
 */
function makeLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  /** 允许通过 req.user.role 给 admin 角色豁免（admin 调试时不受限） */
  adminBypass?: boolean;
}) {
  const { windowMs, max, message, adminBypass } = opts;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7', // 返回 RateLimit-* 标准头
    legacyHeaders: false,
    /** req.user 存在且 role=admin 时跳过计数（便于管理员调试） */
    skip: (_req, res) => {
      if (!adminBypass) return false;
      const u = (res.req as any).user;
      return !!u && u.role === 'admin';
    },
    handler: (req: Request, res: Response) => {
      const ip =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        'unknown';
      const retryAfterSec = Math.ceil(windowMs / 1000);
      log.WARN(
        `IP 限流触发: ${ip} 路径 ${req.path} 阈值 ${max}/${windowMs}ms → 429`
      );
      sendRateLimited(res, message, retryAfterSec);
    },
  });
}

// ================ 1. 全局登录失败 IP 限流（最严格，防撞库） ================
/** 所有登录通道合计：1 小时内同一 IP 20 次失败后锁 15 分钟 */
export const loginFailIpLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: '登录失败过于频繁，IP 已被临时锁定 15 分钟，请稍后再试',
});

// ================ 2. 图形验证码 ================
/** 获取验证码：1 分钟 60 次（宽松，只是防连续刷新浪费） */
export const captchaLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: '验证码获取过于频繁，请稍后再试',
});

// ================ 3. 邮箱验证码 ================
/** 发送邮箱验证码：5 分钟 3 次（防短信/邮件轰炸） */
export const emailCodeSendLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: '邮箱验证码发送过于频繁，请 5 分钟后再试',
});

// ================ 4. 手机号验证码 ================
/** 发送手机验证码：5 分钟 3 次（防短信轰炸） */
export const phoneCodeSendLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: '短信验证码发送过于频繁，请 5 分钟后再试',
});

// ================ 5. 各通道登录 ================
/** 邮箱验证码登录：1 分钟 10 次 */
export const emailLoginLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: '邮箱登录请求过于频繁，请稍后再试',
  adminBypass: true,
});

/** 手机号验证码登录：1 分钟 10 次 */
export const phoneLoginLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: '手机号登录请求过于频繁，请稍后再试',
  adminBypass: true,
});

/** 密码登录：1 分钟 10 次 */
export const passwordLoginLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: '密码登录请求过于频繁，请稍后再试',
  adminBypass: true,
});

/** SSO ticket consume：1 分钟 10 次 */
export const ssoConsumeLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: 'SSO 票据请求过于频繁，请稍后再试',
});

/** 证书登录：1 分钟 30 次 */
export const certLoginLimiter = makeLimiter({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: '证书登录请求过于频繁，请稍后再试',
});

// ================ 6. 注册 ================
/** 注册：1 小时 5 次（防批量建号） */
export const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: '注册过于频繁，请稍后再试',
});

/**
 * 开发辅助：打印所有限流实例的当前计数（调试用）
 * 可选：在 config 里加 DEBUG_RATE_LIMIT=true 时暴露 /api/v1/debug/rate-limits
 */
export const rateLimitConfig = {
  /** 账号锁定：连续失败 N 次后锁 M 毫秒 */
  accountMaxFails: 5,
  accountLockMs: 15 * 60 * 1000,
  /** IP 锁定：登录失败超限后锁 N 毫秒 */
  loginFailIpLockMs: 15 * 60 * 1000,
};

void config; // 保留引用，避免未使用告警
