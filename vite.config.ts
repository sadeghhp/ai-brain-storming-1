import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves project sites from `/<repo>/`, so Vite must build with a matching base.
  // On GitHub Actions, `GITHUB_REPOSITORY` is like "owner/repo". For user/org Pages repos
  // (e.g. "owner/owner.github.io") we keep base as "/".
  base: (() => {
    const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1];
    if (!repo) return '/';
    if (repo.toLowerCase().endsWith('.github.io')) return '/';
    return `/${repo}/`;
  })(),
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

