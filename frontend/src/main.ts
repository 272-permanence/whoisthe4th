import { createApp } from 'vue'
// tokens.css 必须在 style.css 之前引入，这样全局样式里才能用 CSS 变量
import './styles/tokens.css'
import './style.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
