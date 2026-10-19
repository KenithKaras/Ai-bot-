import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Make sure SSE streaming isn't buffered
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.url?.includes('/stream')) {
              // Ensure proxy headers for streaming
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
