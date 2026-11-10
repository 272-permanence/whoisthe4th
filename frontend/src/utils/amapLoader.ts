/**
 * @file 高德地图 JS API 懒加载工具
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description 按需注入高德 JS API 2.0 脚本并配置安全密钥，避免全站首屏引入地图 SDK。
 */

/** 地图实例（仅声明用到的成员，其余交给高德内部实现） */
export interface AmapMap {
  add(overlay: unknown | unknown[]): void;
  remove(overlay: unknown | unknown[]): void;
  setFitView(overlays?: unknown[], immediately?: boolean, avoidOutOfView?: boolean, allowPolyline?: boolean): void;
  setZoomAndCenter(zoom: number, center: [number, number]): void;
  destroy(): void;
}

/** 覆盖物实例 */
export interface AmapOverlay {
  setMap(map: AmapMap | null): void;
}

/** 高德命名空间（只声明本项目用到的构造器） */
export interface AmapNamespace {
  Map: new (container: HTMLElement | string, options?: Record<string, unknown>) => AmapMap;
  Marker: new (options: Record<string, unknown>) => AmapOverlay;
  Polyline: new (options: Record<string, unknown>) => AmapOverlay;
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
    AMap?: AmapNamespace;
  }
}

/** 脚本节点 ID，避免重复注入 */
const SCRIPT_ID = 'amap-jsapi-script';

/** 并发调用复用同一个加载 Promise */
let loadingPromise: Promise<AmapNamespace> | null = null;

/**
 * 加载高德 JS API（已加载则直接复用）
 * @returns 高德命名空间
 * @throws Key 缺失或脚本加载失败时抛出
 */
export function loadAmap(): Promise<AmapNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('高德地图只能在浏览器环境加载'));
  }
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined;
  if (!key) {
    return Promise.reject(new Error('未配置 VITE_AMAP_KEY，请在 frontend/.env.local 中填写'));
  }
  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode };
  }

  loadingPromise = new Promise<AmapNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.Scale,AMap.ToolBar`;
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap);
      } else {
        loadingPromise = null;
        reject(new Error('高德地图脚本加载完成但未挂载 AMap 对象'));
      }
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('高德地图脚本加载失败，请检查网络或 Key 配置'));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}
