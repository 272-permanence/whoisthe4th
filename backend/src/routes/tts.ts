/**
 * @file TTS 路由（独立于 ASR，新分工要求去掉 asr-tts 前缀）
 * @author 第八组（成员A）
 * @date 2026-11-10
 * @description 主入口：GET /api/v1/tts/stream → 语音合成 SSE 流式接口。
 *              旧路径 /api/v1/asr-tts/tts/stream 在 asrTts.ts 里 redirect 过来，
 *              客户端不用改就能平滑迁移。
 */
import { Router } from 'express';
import { handleTtsStream } from '../controllers/asrTtsController.js';

const router = Router();

/** 文字转语音：SSE 流式接口，text 通过查询参数传入 */
router.get('/stream', handleTtsStream);

export default router;
