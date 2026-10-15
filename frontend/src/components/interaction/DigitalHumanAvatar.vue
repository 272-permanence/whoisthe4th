<script setup lang="ts">
/**
 * @file 数字人形象组件
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 用 Canvas 2D 绘制景区导览数字人形象，口型开合度由父组件传入的音频振幅实时驱动，
 *              说话时头部带轻微起伏、脸颊泛光，未说话时保持自然呼吸节律与随机眨眼。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 组件属性 */
interface Props {
  /** 口型开合度 0~1，由播放中的音频振幅驱动 */
  mouthOpen: number
  /** 是否正在说话，用于头部起伏与脸颊高光 */
  isSpeaking: boolean
}

const props = defineProps<Props>()

/** 画布逻辑宽度 */
const CANVAS_WIDTH = 320
/** 画布逻辑高度 */
const CANVAS_HEIGHT = 360
/** 头部圆心横坐标 */
const HEAD_CENTER_X = 160
/** 头部圆心纵坐标 */
const HEAD_CENTER_Y = 152
/** 头部半径 */
const HEAD_RADIUS = 74
/** 肤色 */
const SKIN_COLOR = '#f7d9c4'
/** 肤色暗部 */
const SKIN_SHADOW = '#e6bda4'
/** 发色 */
const HAIR_COLOR = '#2b3547'
/** 导览员制服主色 */
const UNIFORM_COLOR = '#1f6feb'
/** 导览员制服暗部 */
const UNIFORM_DARK_COLOR = '#17539f'
/** 瞳孔颜色 */
const EYE_COLOR = '#1b2740'
/** 眼白颜色 */
const EYE_WHITE_COLOR = '#fbfdff'
/** 嘴腔颜色 */
const MOUTH_INNER_COLOR = '#7c2a37'
/** 嘴唇描边颜色 */
const MOUTH_LIP_COLOR = '#c9737f'
/** 眨眼间隔（毫秒） */
const BLINK_INTERVAL_MS = 3400
/** 单次眨眼持续时长（毫秒） */
const BLINK_DURATION_MS = 150
/** 口型最小高度 */
const MOUTH_MIN_HEIGHT = 3
/** 口型最大高度 */
const MOUTH_MAX_HEIGHT = 26
/** 口型最大宽度 */
const MOUTH_MAX_WIDTH = 52
/** 口型最小宽度 */
const MOUTH_MIN_WIDTH = 26
/** 两倍圆周率 */
const TWO_PI = Math.PI * 2

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationFrameId = 0

/**
 * 按设备像素比配置画布，避免高分屏下图像发虚
 * @param canvas 画布元素
 * @returns 绘制上下文
 */
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d')
  if (context === null) {
    return null
  }
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  canvas.width = CANVAS_WIDTH * ratio
  canvas.height = CANVAS_HEIGHT * ratio
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  return context
}

/**
 * 绘制肩部与制服，形成半身像底座
 * @param context 绘制上下文
 */
function drawBody(context: CanvasRenderingContext2D): void {
  const shoulderTop = HEAD_CENTER_Y + 140
  context.beginPath()
  context.moveTo(HEAD_CENTER_X - 118, CANVAS_HEIGHT)
  context.quadraticCurveTo(HEAD_CENTER_X - 104, shoulderTop, HEAD_CENTER_X, shoulderTop)
  context.quadraticCurveTo(HEAD_CENTER_X + 104, shoulderTop, HEAD_CENTER_X + 118, CANVAS_HEIGHT)
  context.closePath()
  const gradient = context.createLinearGradient(0, shoulderTop, 0, CANVAS_HEIGHT)
  gradient.addColorStop(0, UNIFORM_COLOR)
  gradient.addColorStop(1, UNIFORM_DARK_COLOR)
  context.fillStyle = gradient
  context.fill()

  // 制服领口
  context.beginPath()
  context.moveTo(HEAD_CENTER_X - 34, shoulderTop + 6)
  context.lineTo(HEAD_CENTER_X, shoulderTop + 46)
  context.lineTo(HEAD_CENTER_X + 34, shoulderTop + 6)
  context.closePath()
  context.fillStyle = EYE_WHITE_COLOR
  context.fill()

  // 导游工牌
  context.beginPath()
  context.rect(HEAD_CENTER_X + 46, shoulderTop + 40, 30, 22)
  context.fillStyle = '#f5c451'
  context.fill()
}

/**
 * 绘制脖颈
 * @param context 绘制上下文
 */
function drawNeck(context: CanvasRenderingContext2D): void {
  context.beginPath()
  context.rect(HEAD_CENTER_X - 20, HEAD_CENTER_Y + 54, 40, 60)
  context.fillStyle = SKIN_SHADOW
  context.fill()
}

/**
 * 绘制头部（肤色球体 + 头发 + 导游帽）
 * @param context 绘制上下文
 */
function drawHead(context: CanvasRenderingContext2D): void {
  const gradient = context.createRadialGradient(
    HEAD_CENTER_X - 24,
    HEAD_CENTER_Y - 30,
    12,
    HEAD_CENTER_X,
    HEAD_CENTER_Y,
    HEAD_RADIUS
  )
  gradient.addColorStop(0, '#fff4ea')
  gradient.addColorStop(1, SKIN_COLOR)
  context.beginPath()
  context.arc(HEAD_CENTER_X, HEAD_CENTER_Y, HEAD_RADIUS, 0, TWO_PI)
  context.fillStyle = gradient
  context.fill()

  // 两侧鬓发
  context.beginPath()
  context.arc(HEAD_CENTER_X - 66, HEAD_CENTER_Y + 6, 18, 0, TWO_PI)
  context.arc(HEAD_CENTER_X + 66, HEAD_CENTER_Y + 6, 18, 0, TWO_PI)
  context.fillStyle = HAIR_COLOR
  context.fill()

  // 刘海
  context.beginPath()
  context.ellipse(HEAD_CENTER_X, HEAD_CENTER_Y - 54, 76, 34, 0, Math.PI, TWO_PI)
  context.fillStyle = HAIR_COLOR
  context.fill()

  // 导游帽帽檐
  context.beginPath()
  context.ellipse(HEAD_CENTER_X, HEAD_CENTER_Y - 62, 88, 20, 0, 0, TWO_PI)
  context.fillStyle = UNIFORM_COLOR
  context.fill()

  // 帽徽
  context.beginPath()
  context.arc(HEAD_CENTER_X, HEAD_CENTER_Y - 76, 8, 0, TWO_PI)
  context.fillStyle = '#f5c451'
  context.fill()
}

/**
 * 绘制眼睛（含眨眼效果）
 * @param context 绘制上下文
 * @param isBlinking 当前是否处于闭眼帧
 */
function drawEyes(context: CanvasRenderingContext2D, isBlinking: boolean): void {
  const eyeOffsetX = 26
  const eyeY = HEAD_CENTER_Y - 6
  for (const direction of [-1, 1]) {
    const eyeX = HEAD_CENTER_X + direction * eyeOffsetX
    context.beginPath()
    context.ellipse(eyeX, eyeY, 15, isBlinking ? 2 : 17, 0, 0, TWO_PI)
    context.fillStyle = EYE_WHITE_COLOR
    context.fill()
    if (isBlinking) {
      continue
    }
    context.beginPath()
    context.arc(eyeX, eyeY + 2, 8, 0, TWO_PI)
    context.fillStyle = EYE_COLOR
    context.fill()
    // 眼神高光，让形象更有神
    context.beginPath()
    context.arc(eyeX + 3, eyeY - 2, 3, 0, TWO_PI)
    context.fillStyle = '#ffffff'
    context.fill()
  }

  // 眉毛
  context.strokeStyle = HAIR_COLOR
  context.lineWidth = 5
  context.lineCap = 'round'
  for (const direction of [-1, 1]) {
    context.beginPath()
    context.moveTo(HEAD_CENTER_X + direction * 42, HEAD_CENTER_Y - 34)
    context.quadraticCurveTo(HEAD_CENTER_X + direction * 26, HEAD_CENTER_Y - 44, HEAD_CENTER_X + direction * 12, HEAD_CENTER_Y - 34)
    context.stroke()
  }
}

/**
 * 绘制鼻子
 * @param context 绘制上下文
 */
function drawNose(context: CanvasRenderingContext2D): void {
  context.beginPath()
  context.moveTo(HEAD_CENTER_X, HEAD_CENTER_Y + 4)
  context.quadraticCurveTo(HEAD_CENTER_X + 8, HEAD_CENTER_Y + 20, HEAD_CENTER_X, HEAD_CENTER_Y + 24)
  context.lineWidth = 3
  context.strokeStyle = SKIN_SHADOW
  context.stroke()
}

/**
 * 绘制口型，开合度由音频振幅决定
 * @param context 绘制上下文
 * @param open 口型开合度 0~1
 */
function drawMouth(context: CanvasRenderingContext2D, open: number): void {
  const mouthY = HEAD_CENTER_Y + 42
  const width = MOUTH_MAX_WIDTH - (MOUTH_MAX_WIDTH - MOUTH_MIN_WIDTH) * open
  const height = MOUTH_MIN_HEIGHT + (MOUTH_MAX_HEIGHT - MOUTH_MIN_HEIGHT) * open
  context.beginPath()
  context.ellipse(HEAD_CENTER_X, mouthY, width / 2, height / 2, 0, 0, TWO_PI)
  context.fillStyle = MOUTH_INNER_COLOR
  context.fill()
  context.lineWidth = 2.5
  context.strokeStyle = MOUTH_LIP_COLOR
  context.stroke()
}

/**
 * 绘制脸颊红晕，说话时更明显
 * @param context 绘制上下文
 * @param isSpeaking 是否正在说话
 */
function drawBlush(context: CanvasRenderingContext2D, isSpeaking: boolean): void {
  context.globalAlpha = isSpeaking ? 0.45 : 0.25
  context.fillStyle = '#f79c9c'
  for (const direction of [-1, 1]) {
    context.beginPath()
    context.ellipse(HEAD_CENTER_X + direction * 46, HEAD_CENTER_Y + 26, 14, 9, 0, 0, TWO_PI)
    context.fill()
  }
  context.globalAlpha = 1
}

/**
 * 绘制单帧画面
 * @param context 绘制上下文
 * @param elapsedMs 动画已运行时长（毫秒）
 */
function drawFrame(context: CanvasRenderingContext2D, elapsedMs: number): void {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // 背景柔光
  const halo = context.createRadialGradient(HEAD_CENTER_X, HEAD_CENTER_Y, 40, HEAD_CENTER_X, HEAD_CENTER_Y, 200)
  halo.addColorStop(0, 'rgba(56, 189, 248, 0.18)')
  halo.addColorStop(1, 'rgba(56, 189, 248, 0)')
  context.fillStyle = halo
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const isBlinking = elapsedMs % BLINK_INTERVAL_MS < BLINK_DURATION_MS
  // 说话时头部随语句节奏更明显地起伏，否则保持缓慢呼吸
  const bob = props.isSpeaking
    ? Math.sin(elapsedMs / 110) * 2.4
    : Math.sin(elapsedMs / 520) * 1.2

  context.save()
  context.translate(0, bob)
  drawBody(context)
  drawNeck(context)
  drawHead(context)
  drawEyes(context, isBlinking)
  drawNose(context)
  drawMouth(context, Math.max(0, Math.min(1, props.mouthOpen)))
  drawBlush(context, props.isSpeaking)
  context.restore()
}

onMounted(() => {
  const canvas = canvasRef.value
  if (canvas === null) {
    return
  }
  const context = setupCanvas(canvas)
  if (context === null) {
    return
  }
  const startedAt = performance.now()
  const loop = (): void => {
    drawFrame(context, performance.now() - startedAt)
    animationFrameId = window.requestAnimationFrame(loop)
  }
  animationFrameId = window.requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (animationFrameId !== 0) {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
  }
})
</script>

<template>
  <div class="digital-human-avatar">
    <canvas ref="canvasRef" class="digital-human-avatar__canvas" />
  </div>
</template>

<style scoped>
.digital-human-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
}

.digital-human-avatar__canvas {
  width: 100%;
  max-width: 320px;
  height: auto;
}
</style>
