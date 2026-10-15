/// <reference types="vite/client" />

/**
 * @file Vite 环境变量类型声明
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 为 import.meta.env 上的自定义变量提供类型提示。
 */

interface ImportMetaEnv {
  /** 后端服务基础地址，形如 http://localhost:8000 */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
