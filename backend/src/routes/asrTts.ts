/**
 * @file ASR/TTS 路由模块
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 语音识别（POST 上传音频）与语音合成（GET SSE 流式输出）接口的路由层。
 */
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { handleTranscribe } from '../controllers/asrTtsController.js';

const upload = multer({
  // 音频体积较小，直接放内存，避免落盘带来的清理成本
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 8 }
});

const router = Router();

/** 语音转文字：multipart/form-data，音频字段名固定为 audio */
router.post('/asr', upload.single('audio'), handleTranscribe);

/**
 * 旧的 TTS SSE 路径（带多余的 asr-tts 前缀），重定向到新的 /api/v1/tts/stream。
 * 保留一个版本再删 —— 等全组客户端都改完就移掉。
 */
router.get('/tts/stream', (req, res) => {
  const rawText = req.query.text;
  const text = typeof rawText === 'string' ? rawText : '';
  res.redirect(307, '/api/v1/tts/stream?text=' + encodeURIComponent(text));
});

export default router;
