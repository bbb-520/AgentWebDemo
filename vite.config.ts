import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 开发代理：把 /api 请求转发到 Java 后端(AgentDemo)。
 * 后端默认 8080，本项目实际常以 18080 启动；
 * 需要换地址时设置环境变量 VITE_PROXY_TARGET，例如：
 *   VITE_PROXY_TARGET=http://localhost:8080 npm run dev
 */
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:18080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target,
        changeOrigin: true,
        // SSE(text/event-stream) 流会由 http-proxy 直接透传，
        // 无需额外配置；不要在此强行改 Accept，否则普通 JSON 接口会 406。
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
