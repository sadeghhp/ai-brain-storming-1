import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Dev-only: avoid browser CORS by proxying ingest calls through the Vite server.
      // Browser calls: http://localhost:3000/ingest/...
      // Vite forwards to: http://127.0.0.1:7243/ingest/...
      '/ingest': {
        target: 'http://127.0.0.1:7243',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'ES2022',
    outDir: 'dist',
    sourcemap: true,
  },
});

