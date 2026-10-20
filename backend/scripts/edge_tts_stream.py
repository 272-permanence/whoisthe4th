"""
@file Edge-TTS 流式语音合成脚本
@author 第八组（成员A）
@date 2026-10-15
@description 调用微软 Edge Read Aloud 在线合成服务，把音频分片实时写入 stdout（二进制流），
             stderr 仅用于输出异常信息。Node 后端读取 stdout 后转成 SSE 的 audio 事件下发前端。

用法:
    python edge_tts_stream.py --text "你好，欢迎来到西湖景区" --voice zh-CN-XiaoxiaoNeural --rate +0%
依赖:
    pip install edge-tts
"""
from __future__ import annotations

import argparse
import asyncio
import sys

import edge_tts


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(description="Edge-TTS streaming synthesizer")
    parser.add_argument("--text", required=True, help="待合成的文本")
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural", help="音色名")
    parser.add_argument("--rate", default="+0%", help="语速，如 +10%% / -10%%")
    parser.add_argument("--volume", default="+0%", help="音量，如 +10%%")
    parser.add_argument("--pitch", default="+0Hz", help="音调，如 +20Hz")
    return parser.parse_args()


async def stream_audio(args: argparse.Namespace) -> int:
    """逐分片合成音频并写入 stdout，返回已写出的字节数。"""
    communicate = edge_tts.Communicate(
        args.text,
        args.voice,
        rate=args.rate,
        volume=args.volume,
        pitch=args.pitch,
    )
    stdout = sys.stdout.buffer
    written = 0
    async for chunk in communicate.stream():
        if chunk["type"] != "audio":
            # 服务端还可能下发 SentenceBoundary 等元数据，本项目口型由前端音频振幅驱动，故忽略
            continue
        stdout.write(chunk["data"])
        # 必须逐块 flush，否则会被 Python 缓冲，前端将无法实时播放
        stdout.flush()
        written += len(chunk["data"])
    return written


def main() -> int:
    """脚本入口，异常统一写入 stderr 并以非 0 退出码通知上层。"""
    args = parse_args()
    try:
        written = asyncio.run(stream_audio(args))
    except Exception as error:  # noqa: BLE001 - 需要把任意合成失败抛给 Node 侧统一处理
        sys.stderr.write(f"edge-tts failed: {error}\n")
        return 1
    if written == 0:
        sys.stderr.write("edge-tts failed: no audio chunk received\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
