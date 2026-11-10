/**
 * @file 前端埋点工具（成员D）
 * @description 统一的前端日志采集：手动埋点、自动 data-track 绑定、JS 错误上报。
 *              每条日志自动携带 traceId（全链路关联）、当前路由、时间戳。
 *              统一 POST 到后端 `/api/v1/logs/operation`（D 负责实现的接口）。
 * @author 第八组（成员D）
 * @date 2026-11-07
 */
import { getTraceId } from '../common/apiClient';
import { API_BASE_URL } from '../constants/apiConstants';

/** 埋点后端接口（直接用 fetch，不走 apiFetch 的 envelope 解包） */
const LOG_ENDPOINT = `${API_BASE_URL}/api/v1/logs/operation`;

/** 每条埋点日志的通用结构 */
export interface TrackLogPayload {
  traceId: string;
  action: string;
  resourceId: string;
  resourceType: string;
  pagePath: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}

/**
 * 获取当前页面路径（包含 querystring，排除 hash 避免单页应用 hash 路由干扰）
 */
function getCurrentPagePath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 统一发送埋点（内部方法，对外通过 trackClick / trackError 间接调用）
 * 用 fetch 直接发送，不走 apiFetch 的 envelope 解包，因为后端日志接口不一定返回标准 {code, data} 结构。
 */
async function sendLog(payload: TrackLogPayload): Promise<void> {
  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': payload.traceId,
      },
      body: JSON.stringify(payload),
      // 忽略响应（埋点是 best-effort，不阻塞业务逻辑）
      keepalive: true,
    });
  } catch (e) {
    // 埋点失败只打 console，不向上抛
    console.warn('[track] 埋点上报失败', e);
  }
}

/**
 * 手动埋点：记录一次用户点击/交互
 * @param resourceId  资源 ID，如 'poi-card:11'、'navigate:start-plan'
 * @param resourceType 资源类型，如 'poi-card'、'navigate'、'button'
 * @param extra 额外自定义字段，会合并到 payload.extra 中
 */
export function trackClick(
  resourceId: string,
  resourceType: string,
  extra?: Record<string, unknown>,
): void {
  const payload: TrackLogPayload = {
    traceId: getTraceId(),
    action: 'click',
    resourceId,
    resourceType,
    pagePath: getCurrentPagePath(),
    timestamp: Date.now(),
    extra,
  };
  void sendLog(payload);
}

/**
 * 自动绑定 data-track 属性的点击事件
 * 约定：元素上加 `data-track="resourceType:resourceId"`，例如
 *   <button data-track="navigate:start-plan">开始规划</button>
 *   <article data-track="poi-card:11">雷峰塔</article>
 * 挂载后，document 上所有带 data-track 的元素点击时都会自动触发 trackClick。
 * 支持动态新增的元素（事件委托在 document 上）。
 */
export function trackAutoBind(): void {
  // 防止重复绑定
  if ((document as unknown as { __trackAutoBound?: boolean }).__trackAutoBound) {
    return;
  }
  (document as unknown as { __trackAutoBound?: boolean }).__trackAutoBound = true;

  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // 沿 DOM 向上查找最近的带 data-track 属性的元素（支持嵌套）
    const trackedEl = target.closest('[data-track]') as HTMLElement | null;
    if (!trackedEl) return;

    const value = trackedEl.getAttribute('data-track');
    if (!value) return;

    // 解析格式："resourceType:resourceId" 或 "resourceType"
    const colonIdx = value.indexOf(':');
    let resourceType: string;
    let resourceId: string;
    if (colonIdx >= 0) {
      resourceType = value.slice(0, colonIdx);
      resourceId = value.slice(colonIdx + 1);
    } else {
      resourceType = value;
      resourceId = trackedEl.id || trackedEl.getAttribute('aria-label') || value;
    }

    trackClick(resourceId, resourceType);
  });
}

/**
 * JS 错误上报（全局捕获用）
 * @param error 捕获到的 Error 对象
 * @param extra 额外自定义字段
 */
export function trackError(error: Error, extra?: Record<string, unknown>): void {
  const payload: TrackLogPayload = {
    traceId: getTraceId(),
    action: 'error',
    resourceId: error.name || 'JSError',
    resourceType: 'js-error',
    pagePath: getCurrentPagePath(),
    timestamp: Date.now(),
    extra: {
      message: error.message,
      stack: error.stack,
      ...extra,
    },
  };
  void sendLog(payload);
}
