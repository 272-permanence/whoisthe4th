/**
 * @file 接口地址常量
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 统一维护后端地址与接口前缀，避免魔法字符串散落在业务代码中。
 */

/** 后端服务基础地址，优先读取 Vite 环境变量 VITE_API_BASE_URL */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** 多模态交互（ASR/TTS）接口前缀 */
export const INTERACTION_API_PREFIX = '/api/v1/asr-tts'
