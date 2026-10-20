<script setup lang="ts">
/**
 * @file Live2D 数字人形象组件
 * @author 第八组（成员A）
 * @date 2026-10-15
 * @description 运行时经 CDN 加载 Live2D 官方免费样例模型（桃濑日和 Hiyori，Cubism 4），
 *              复用上游口型振幅信号驱动模型参数 ParamMouthOpenY，实现 Live2D 口型同步；
 *              模型与素材不随仓库分发。运行库或模型加载失败（含超时）时抛出 unavailable，
 *              由父组件降级为 Canvas 数字人，保证断网演示不开天窗。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Application } from 'pixi.js'
import type { Live2DModel as Live2DModelInstance } from 'pixi-live2d-display/cubism4'
import {
  LIVE2D_CORE_LOAD_TIMEOUT_MS,
  LIVE2D_CUBISM_CORE_SCRIPT_URL,
  LIVE2D_FIT_RATIO,
  LIVE2D_MODEL_LOAD_TIMEOUT_MS,
  LIVE2D_MODEL_URL,
  LIVE2D_MOUTH_PARAM_ID
} from '../../constants/interactionConstants'

/** 组件属性，与 Canvas 数字人保持一致，便于父组件无感切换 */
interface Props {
  /** 口型开合度 0~1，由播放中的音频振幅驱动 */
  mouthOpen: number
  /** 是否正在说话 */
  isSpeaking: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{ unavailable: [reason: string] }>()

/** 本项目用到的 Cubism Core 模型能力子集，避免直接依赖第三方库的类型细节 */
interface CubismCoreModel {
  setParameterValueById: (parameterId: string, value: number, weight?: number) => void
}

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 模型是否已完成加载并可以渲染 */
const isReady = ref(false)

let application: Application | null = null
let model: Live2DModelInstance | null = null
let coreModel: CubismCoreModel | null = null
let resizeObserver: ResizeObserver | null = null
/** 组件是否已销毁，用于丢弃异步加载完成后的过期结果 */
let disposed = false
/** 是否已通知父组件降级，避免重复触发 */
let fallbackEmitted = false
/** Cubism Core 脚本加载任务，多次挂载时复用，失败后重置以允许重试 */
let cubismCoreTask: Promise<void> | null = null

/**
 * 判断全局是否已存在 Cubism Core
 * @returns 全局对象是否就绪
 */
function hasCubismCore(): boolean {
  return 'Live2DCubismCore' in window
}

/**
 * 为 Promise 增加超时，超时即视为该资源不可用
 * @param task 待执行的异步任务
 * @param timeoutMs 超时时长（毫秒）
 * @param message 超时错误文案
 * @returns 任务结果
 */
async function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([task, timeout])
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 确保 Live2D Cubism Core 已加载（注入官方 CDN 脚本，带超时）
 * @returns 加载完成的 Promise
 */
function ensureCubismCore(): Promise<void> {
  if (hasCubismCore()) {
    return Promise.resolve()
  }
  if (cubismCoreTask === null) {
    cubismCoreTask = loadCubismCoreScript().catch((error: unknown) => {
      // 加载失败时重置缓存，便于组件重新挂载后再次尝试
      cubismCoreTask = null
      throw error
    })
  }
  return cubismCoreTask
}

/**
 * 注入并等待 Cubism Core 脚本执行完成
 * @returns 脚本加载完成的 Promise
 */
function loadCubismCoreScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = LIVE2D_CUBISM_CORE_SCRIPT_URL
    script.async = true
    const timer = window.setTimeout(() => {
      script.remove()
      reject(new Error('Live2D 运行库加载超时'))
    }, LIVE2D_CORE_LOAD_TIMEOUT_MS)
    script.addEventListener('load', () => {
      window.clearTimeout(timer)
      if (hasCubismCore()) {
        resolve()
        return
      }
      reject(new Error('Live2D 运行库未能初始化'))
    })
    script.addEventListener('error', () => {
      window.clearTimeout(timer)
      script.remove()
      reject(new Error('Live2D 运行库加载失败'))
    })
    document.head.appendChild(script)
  })
}

/**
 * 每帧在模型变形前写入口型参数，实现振幅驱动口型同步
 * 挂载时机为 internalModel 的 beforeModelUpdate，此时动作、物理、呼吸均已写入参数且尚未变形
 */
function applyMouthParameter(): void {
  if (coreModel === null) {
    return
  }
  const target = props.isSpeaking ? props.mouthOpen : 0
  coreModel.setParameterValueById(LIVE2D_MOUTH_PARAM_ID, Math.max(0, Math.min(1, target)))
}

/**
 * 按容器尺寸重设渲染器大小并让模型等比铺满
 */
function fitModel(): void {
  const container = containerRef.value
  if (application === null || model === null || container === null) {
    return
  }
  const width = Math.max(1, container.clientWidth)
  const height = Math.max(1, container.clientHeight)
  application.renderer.resize(width, height)
  const naturalWidth = model.internalModel.width
  const naturalHeight = model.internalModel.height
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return
  }
  const scale = Math.min(width / naturalWidth, height / naturalHeight) * LIVE2D_FIT_RATIO
  model.anchor.set(0.5, 0.5)
  model.scale.set(scale)
  model.position.set(width / 2, height / 2)
}

/**
 * 通知父组件降级为 Canvas 数字人
 * @param reason 降级原因，便于在界面上说明
 */
function notifyUnavailable(reason: string): void {
  if (fallbackEmitted) {
    return
  }
  fallbackEmitted = true
  emit('unavailable', reason)
}

/**
 * 加载 Cubism Core、Pixi 渲染器与 Live2D 模型
 */
async function setup(): Promise<void> {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (canvas === null || container === null) {
    return
  }
  try {
    await ensureCubismCore()
    // Pixi 与 Live2D 加载器体积较大，按需动态引入，避免拖慢首屏
    const pixi = await import('pixi.js')
    const live2d = await import('pixi-live2d-display/cubism4')
    if (disposed) {
      return
    }
    // 必须显式注册 Ticker，否则模型不会自动更新（本组件未设置全局 window.PIXI）
    live2d.Live2DModel.registerTicker(pixi.Ticker)

    const app = new pixi.Application({
      view: canvas,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
      // 与数字人共用同一 Ticker，确保模型更新先于画面渲染
      sharedTicker: true
    })
    application = app

    const loaded = await withTimeout(
      live2d.Live2DModel.from(LIVE2D_MODEL_URL, { autoInteract: false }),
      LIVE2D_MODEL_LOAD_TIMEOUT_MS,
      'Live2D 模型加载超时'
    )
    if (disposed) {
      loaded.destroy()
      return
    }
    model = loaded
    coreModel = loaded.internalModel.coreModel as unknown as CubismCoreModel
    loaded.internalModel.on('beforeModelUpdate', applyMouthParameter)
    app.stage.addChild(loaded)
    fitModel()
    isReady.value = true

    resizeObserver = new ResizeObserver(fitModel)
    resizeObserver.observe(container)
  } catch (error) {
    notifyUnavailable(error instanceof Error ? error.message : 'Live2D 初始化失败')
  }
}

/**
 * 释放渲染器、模型与监听器
 */
function dispose(): void {
  disposed = true
  if (resizeObserver !== null) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (model !== null) {
    model.internalModel.off('beforeModelUpdate', applyMouthParameter)
    model.destroy()
    model = null
  }
  coreModel = null
  if (application !== null) {
    // 画布由 Vue 负责移除，避免与模板卸载冲突
    application.destroy(false)
    application = null
  }
  isReady.value = false
}

onMounted(() => {
  void setup()
})

onBeforeUnmount(dispose)
</script>

<template>
  <div ref="containerRef" class="live2d-avatar">
    <canvas ref="canvasRef" class="live2d-avatar__canvas" />
    <p v-if="!isReady" class="live2d-avatar__hint">Live2D 数字人加载中…</p>
  </div>
</template>

<style scoped>
.live2d-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 360px;
  overflow: hidden;
}

.live2d-avatar__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.live2d-avatar__hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #6f8fb5;
}
</style>
