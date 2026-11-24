/**
 * @file 前端入口：Vue 应用挂载、路由、状态管理、全局错误捕获
 * @author 第八组
 * @date 2026-10-27
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 【性能优化】不再全量引入 vant/lib/index.css（约 197KB）
// 普通组件样式由 unplugin-vue-components + VantResolver 按需自动注入；
// 这里只需手动补充函数式调用的 Toast / Dialog 样式
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import './style.css'
import './styles/tokens.css'
import App from './App.vue'
import router from './router'
import { trackError } from './utils/track'

const app = createApp(App)

// ============ 全局错误捕获（成员D · 日志系统）============

// 1. Vue 组件渲染/生命周期错误
app.config.errorHandler = (err, _vm, info) => {
  console.error('[Vue errorHandler]', err, info)
  trackError(err instanceof Error ? err : new Error(String(err)), {
    source: 'vue-errorHandler',
    info,
  })
}

// 2. 全局 JS 运行时错误
window.onerror = (message, source, lineno, colno, err) => {
  console.error('[window.onerror]', message, source, lineno, colno, err)
  const error = err instanceof Error
    ? err
    : new Error(typeof message === 'string' ? message : String(message))
  trackError(error, {
    source: 'window.onerror',
    scriptSource: source,
    lineno,
    colno,
  })
}

// 3. 未捕获的 Promise rejection
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason)
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason))
  trackError(error, {
    source: 'unhandledrejection',
  })
})

// ========================================================

app.use(createPinia())
app.use(router)
app.mount('#app')
