"""
@file 本地 Whisper 语音识别脚本（faster-whisper 实现）
@author 第八组（成员A）
@date 2026-10-15
@description 作为 ASR_PROVIDER=whisper-cli 的默认后端，读取音频文件并输出识别文本。
             相比 whisper.cpp 无需 C++ 编译工具链，pip 安装即可，且完全可离线运行。
             前端上传的音频统一为 16kHz 单声道 16bit WAV，此时直接用标准库 wave 读取采样并
             以 float32 数组交给模型，避开 PyAV 版本差异；其他格式再交给 faster-whisper 自行解码。

用法:
    python whisper_transcribe.py --audio input.wav --model small --language zh
依赖:
    pip install faster-whisper      # 首次运行会自动下载模型
    # 国内下载模型较慢时可先设置镜像: set HF_ENDPOINT=https://hf-mirror.com
输出:
    stdout 仅输出识别文本，便于 Node 侧直接读取
"""

from __future__ import annotations

import argparse
import sys
import wave

import numpy as np

# 模型要求的采样率：与之一致时可以直接使用 wave 读取的采样数组
TARGET_SAMPLE_RATE = 16_000
# 16bit PCM 的位深
PCM_SAMPLE_WIDTH = 2
# 16bit PCM 的满量程值
PCM_SCALE = 32_768.0


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(description="Local Whisper transcriber")
    parser.add_argument("--audio", required=True, help="待识别的音频文件路径")
    parser.add_argument("--model", default="small", help="模型规格 tiny/base/small/medium/large-v3")
    parser.add_argument("--language", default="zh", help="语言代码，zh 表示中文")
    parser.add_argument("--device", default="auto", help="推理设备 auto/cpu/cuda")
    return parser.parse_args()


def load_wav_samples(audio_path: str) -> "np.ndarray | None":
    """读取 16kHz 单声道 16bit WAV，返回 [-1, 1] 的 float32 采样数组。

    参数:
        audio_path: 音频文件路径
    返回:
        采样数组；文件不是 16kHz 单声道 16bit WAV 时返回 None，交由解码库处理
    """
    try:
        with wave.open(audio_path, "rb") as handle:
            if handle.getframerate() != TARGET_SAMPLE_RATE or handle.getsampwidth() != PCM_SAMPLE_WIDTH:
                return None
            channel_count = handle.getnchannels()
            frames = handle.readframes(handle.getnframes())
    except (wave.Error, EOFError, OSError):
        return None
    samples = np.frombuffer(frames, dtype="<i2").astype("float32") / PCM_SCALE
    if channel_count > 1:
        samples = samples.reshape(-1, channel_count).mean(axis=1)
    return samples


def transcribe(args: argparse.Namespace) -> str:
    """执行语音识别并返回纯文本结果。"""
    # 延迟导入，便于未安装依赖时快速给出明确报错
    from faster_whisper import WhisperModel  # noqa: PLC0415

    device = "cpu" if args.device == "auto" else args.device
    compute_type = "int8" if device == "cpu" else "float16"
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    samples = load_wav_samples(args.audio)
    audio_input = args.audio if samples is None else samples
    segments, _info = model.transcribe(audio_input, language=args.language, vad_filter=True)
    return "".join(segment.text for segment in segments).strip()


def main() -> int:
    """脚本入口，异常统一写入 stderr 并以非 0 退出码通知上层。"""
    args = parse_args()
    try:
        text = transcribe(args)
    except Exception as error:  # noqa: BLE001 - 需要把任意识别失败抛给 Node 侧统一处理
        sys.stderr.write(f"whisper transcription failed: {error}\n")
        return 1
    sys.stdout.write(text)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
