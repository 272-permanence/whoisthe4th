import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { VantResolver } from '@vant/auto-import-resolver'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Vant 组件按需自动导入
    Components({
      resolvers: [VantResolver()],
    }),
    // API 自动导入（ref, reactive, onMounted 等 Vue API）
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // SPA history fallback — 直接访问 /products/1 等深链接不 404
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 【性能优化】按库手动分包：体积大且更新频率低的依赖单独成块，命中浏览器长效缓存
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
          if (id.includes('pixi')) return 'vendor-pixi';
          if (id.includes('vant') || id.includes('@vant')) return 'vendor-vant';
          if (id.includes('socket.io') || id.includes('engine.io')) return 'vendor-socket';
          return 'vendor';
        },
      },
    },
  },
})
