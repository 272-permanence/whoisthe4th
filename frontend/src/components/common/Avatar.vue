<script setup lang="ts">
/**
 * @file 通用数字人头像组件（PC 端 + 移动端公用）
 * @author 第八组（成员A）
 * @date 2026-11-03（重构自 interaction/DigitalHumanAvatar.vue）
 * @description 用 Canvas 2D 绘制景区导览员卡通形象。
 *              - mode='breathing'：只有呼吸起伏 + 随机眨眼，不画嘴，CPU 占用低，适合移动端；
 *              - mode='lip-sync'：嘴型由父组件传入的音频振幅实时驱动，适合 PC 端 Live2D 兜底。
 *              - size：sm/md/lg 三档，通过 max-width 控制画布缩放。
 *
 *              成员B的 Poilist/Navigate 页面可直接：
 *              <Avatar mode="breathing" size="sm" />
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/** 显示模式 */
export type AvatarMode = 'breathing' | 'lip-sync';
/** 尺寸档位 */
export type AvatarSize = 'sm' | 'md' | 'lg';

/** 组件属性 */
interface Props {
  /** 显示模式：breathing 静态呼吸 / lip-sync 口型同步 */
  mode?: AvatarMode;
  /** 尺寸档位，控制画布 max-width */
  size?: AvatarSize;
  /** 口型开合度 0~1（仅 mode='lip-sync' 时生效） */
  mouthOpen?: number;
  /** 是否正在说话（仅 mode='lip-sync' 时影响头部起伏与脸颊高光） */
  isSpeaking?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'lip-sync',
  size: 'md',
  mouthOpen: 0,
  isSpeaking: false
});

/** 尺寸档位对应的 CSS max-width */
const SIZE_WIDTH: Record<AvatarSize, string> = {
  sm: '120px',
  md: '320px',
  lg: '420px'
};

/** 画布逻辑宽度（按设计稿固定，CSS 负责缩放显示） */
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 360;
const HEAD_CENTER_X = 160;
const HEAD_CENTER_Y = 152;
const HEAD_RADIUS = 74;

/** 配色常量 */
const SKIN_COLOR = '#f7d9c4';
const SKIN_SHADOW = '#e6bda4';
const HAIR_COLOR = '#2b3547';
const UNIFORM_COLOR = '#1f6feb';
const UNIFORM_DARK_COLOR = '#17539f';
const EYE_COLOR = '#1b2740';
const EYE_WHITE_COLOR = '#fbfdff';
const MOUTH_INNER_COLOR = '#7c2a37';
const MOUTH_LIP_COLOR = '#c9737f';

const BLINK_INTERVAL_MS = 3400;
const BLINK_DURATION_MS = 150;
const MOUTH_MIN_HEIGHT = 3;
const MOUTH_MAX_HEIGHT = 26;
const MOUTH_MAX_WIDTH = 52;
const MOUTH_MIN_WIDTH = 26;
const TWO_PI = Math.PI * 2;

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId = 0;

/** 外层容器 max-width */
const maxWidthStyle = computed(() => SIZE_WIDTH[props.size]);

/**
 * 按设备像素比配置画布，避免高分屏下图像发虚
 */
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  canvas.width = CANVAS_WIDTH * ratio;
  canvas.height = CANVAS_HEIGHT * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function drawBody(context: CanvasRenderingContext2D): void {
  const shoulderTop = HEAD_CENTER_Y + 140;
  context.beginPath();
  context.moveTo(HEAD_CENTER_X - 118, CANVAS_HEIGHT);
  context.quadraticCurveTo(HEAD_CENTER_X - 104, shoulderTop, HEAD_CENTER_X, shoulderTop);
  context.quadraticCurveTo(HEAD_CENTER_X + 104, shoulderTop, HEAD_CENTER_X + 118, CANVAS_HEIGHT);
  context.closePath();
  const gradient = context.createLinearGradient(0, shoulderTop, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, UNIFORM_COLOR);
  gradient.addColorStop(1, UNIFORM_DARK_COLOR);
  context.fillStyle = gradient;
  context.fill();

  // 制服领口
  context.beginPath();
  context.moveTo(HEAD_CENTER_X - 34, shoulderTop + 6);
  context.lineTo(HEAD_CENTER_X, shoulderTop + 46);
  context.lineTo(HEAD_CENTER_X + 34, shoulderTop + 6);
  context.closePath();
  context.fillStyle = EYE_WHITE_COLOR;
  context.fill();

  // 导游工牌
  context.beginPath();
  context.rect(HEAD_CENTER_X + 46, shoulderTop + 40, 30, 22);
  context.fillStyle = '#f5c451';
  context.fill();
}

function drawNeck(context: CanvasRenderingContext2D): void {
  context.beginPath();
  context.rect(HEAD_CENTER_X - 20, HEAD_CENTER_Y + 54, 40, 60);
  context.fillStyle = SKIN_SHADOW;
  context.fill();
}

function drawHead(context: CanvasRenderingContext2D): void {
  const gradient = context.createRadialGradient(
    HEAD_CENTER_X - 24,
    HEAD_CENTER_Y - 30,
    12,
    HEAD_CENTER_X,
    HEAD_CENTER_Y,
    HEAD_RADIUS
  );
  gradient.addColorStop(0, '#fff4ea');
  gradient.addColorStop(1, SKIN_COLOR);
  context.beginPath();
  context.arc(HEAD_CENTER_X, HEAD_CENTER_Y, HEAD_RADIUS, 0, TWO_PI);
  context.fillStyle = gradient;
  context.fill();

  // 两侧鬓发
  context.beginPath();
  context.arc(HEAD_CENTER_X - 66, HEAD_CENTER_Y + 6, 18, 0, TWO_PI);
  context.arc(HEAD_CENTER_X + 66, HEAD_CENTER_Y + 6, 18, 0, TWO_PI);
  context.fillStyle = HAIR_COLOR;
  context.fill();

  // 刘海
  context.beginPath();
  context.ellipse(HEAD_CENTER_X, HEAD_CENTER_Y - 54, 76, 34, 0, Math.PI, TWO_PI);
  context.fillStyle = HAIR_COLOR;
  context.fill();

  // 导游帽帽檐
  context.beginPath();
  context.ellipse(HEAD_CENTER_X, HEAD_CENTER_Y - 62, 88, 20, 0, 0, TWO_PI);
  context.fillStyle = UNIFORM_COLOR;
  context.fill();

  // 帽徽
  context.beginPath();
  context.arc(HEAD_CENTER_X, HEAD_CENTER_Y - 76, 8, 0, TWO_PI);
  context.fillStyle = '#f5c451';
  context.fill();
}

function drawEyes(context: CanvasRenderingContext2D, isBlinking: boolean): void {
  const eyeOffsetX = 26;
  const eyeY = HEAD_CENTER_Y - 6;
  for (const direction of [-1, 1]) {
    const eyeX = HEAD_CENTER_X + direction * eyeOffsetX;
    context.beginPath();
    context.ellipse(eyeX, eyeY, 15, isBlinking ? 2 : 17, 0, 0, TWO_PI);
    context.fillStyle = EYE_WHITE_COLOR;
    context.fill();
    if (isBlinking) {
      continue;
    }
    context.beginPath();
    context.arc(eyeX, eyeY + 2, 8, 0, TWO_PI);
    context.fillStyle = EYE_COLOR;
    context.fill();
    context.beginPath();
    context.arc(eyeX + 3, eyeY - 2, 3, 0, TWO_PI);
    context.fillStyle = '#ffffff';
    context.fill();
  }

  // 眉毛
  context.strokeStyle = HAIR_COLOR;
  context.lineWidth = 5;
  context.lineCap = 'round';
  for (const direction of [-1, 1]) {
    context.beginPath();
    context.moveTo(HEAD_CENTER_X + direction * 42, HEAD_CENTER_Y - 34);
    context.quadraticCurveTo(HEAD_CENTER_X + direction * 26, HEAD_CENTER_Y - 44, HEAD_CENTER_X + direction * 12, HEAD_CENTER_Y - 34);
    context.stroke();
  }
}

function drawNose(context: CanvasRenderingContext2D): void {
  context.beginPath();
  context.moveTo(HEAD_CENTER_X, HEAD_CENTER_Y + 4);
  context.quadraticCurveTo(HEAD_CENTER_X + 8, HEAD_CENTER_Y + 20, HEAD_CENTER_X, HEAD_CENTER_Y + 24);
  context.lineWidth = 3;
  context.strokeStyle = SKIN_SHADOW;
  context.stroke();
}

/**
 * 绘制口型
 * @param open 口型开合度 0~1
 */
function drawMouth(context: CanvasRenderingContext2D, open: number): void {
  const mouthY = HEAD_CENTER_Y + 42;
  const width = MOUTH_MAX_WIDTH - (MOUTH_MAX_WIDTH - MOUTH_MIN_WIDTH) * open;
  const height = MOUTH_MIN_HEIGHT + (MOUTH_MAX_HEIGHT - MOUTH_MIN_HEIGHT) * open;
  context.beginPath();
  context.ellipse(HEAD_CENTER_X, mouthY, width / 2, height / 2, 0, 0, TWO_PI);
  context.fillStyle = MOUTH_INNER_COLOR;
  context.fill();
  context.lineWidth = 2.5;
  context.strokeStyle = MOUTH_LIP_COLOR;
  context.stroke();
}

function drawBlush(context: CanvasRenderingContext2D, isSpeaking: boolean): void {
  context.globalAlpha = isSpeaking ? 0.45 : 0.25;
  context.fillStyle = '#f79c9c';
  for (const direction of [-1, 1]) {
    context.beginPath();
    context.ellipse(HEAD_CENTER_X + direction * 46, HEAD_CENTER_Y + 26, 14, 9, 0, 0, TWO_PI);
    context.fill();
  }
  context.globalAlpha = 1;
}

/**
 * 绘制单帧画面
 */
function drawFrame(context: CanvasRenderingContext2D, elapsedMs: number): void {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 背景柔光
  const halo = context.createRadialGradient(HEAD_CENTER_X, HEAD_CENTER_Y, 40, HEAD_CENTER_X, HEAD_CENTER_Y, 200);
  halo.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
  halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const isBlinking = elapsedMs % BLINK_INTERVAL_MS < BLINK_DURATION_MS;

  // 呼吸节奏：breathing 模式用更缓的呼吸频率（更省电）
  const bobSpeed = props.mode === 'lip-sync' && props.isSpeaking ? 110 : 520;
  const bobAmp = props.mode === 'lip-sync' && props.isSpeaking ? 2.4 : 1.2;
  const bob = Math.sin(elapsedMs / bobSpeed) * bobAmp;

  context.save();
  context.translate(0, bob);
  drawBody(context);
  drawNeck(context);
  drawHead(context);
  drawEyes(context, isBlinking);
  drawNose(context);

  // 仅 lip-sync 模式绘制动态嘴型；breathing 模式画静态闭嘴（减少 Canvas 绘制量）
  if (props.mode === 'lip-sync') {
    drawMouth(context, Math.max(0, Math.min(1, props.mouthOpen)));
  } else {
    // breathing 模式：画一条安静的唇线（ellipse 高=MOUTH_MIN_HEIGHT，嘴腔颜色与唇线）
    const mouthY = HEAD_CENTER_Y + 42;
    context.beginPath();
    context.ellipse(HEAD_CENTER_X, mouthY, MOUTH_MIN_WIDTH / 2, MOUTH_MIN_HEIGHT / 2, 0, 0, TWO_PI);
    context.fillStyle = MOUTH_INNER_COLOR;
    context.fill();
    context.lineWidth = 2.5;
    context.strokeStyle = MOUTH_LIP_COLOR;
    context.stroke();
  }

  drawBlush(context, props.mode === 'lip-sync' ? props.isSpeaking : false);
  context.restore();
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (canvas === null) {
    return;
  }
  const context = setupCanvas(canvas);
  if (context === null) {
    return;
  }
  const startedAt = performance.now();
  const loop = (): void => {
    drawFrame(context, performance.now() - startedAt);
    animationFrameId = window.requestAnimationFrame(loop);
  };
  animationFrameId = window.requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  if (animationFrameId !== 0) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
});
</script>

<template>
  <div class="avatar" :style="{ maxWidth: maxWidthStyle }">
    <canvas ref="canvasRef" class="avatar__canvas" />
  </div>
</template>

<style scoped>
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
}

.avatar__canvas {
  width: 100%;
  height: auto;
  display: block;
}
</style>
