/**
 * @file 前端入口：Vue 应用挂载、路由、状态管理
 * @author 第八组
 * @date 2026-10-27
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vant/lib/index.css'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
