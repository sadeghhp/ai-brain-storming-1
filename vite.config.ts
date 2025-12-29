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
      // Dev-only: MCP server proxy to avoid CORS issues
      // Browser calls: http://localhost:3000/mcp-proxy/aitools.emofid.com/mcp
      // Vite forwards to: https://aitools.emofid.com/mcp
      '/mcp-proxy': {
        target: 'https://placeholder.local',
        changeOrigin: true,
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Extract the target host from the URL path
            // /mcp-proxy/aitools.emofid.com/mcp -> https://aitools.emofid.com/mcp
            const pathParts = req.url?.split('/mcp-proxy/')[1];
            if (pathParts) {
              const firstSlash = pathParts.indexOf('/');
              const targetHost = firstSlash > 0 ? pathParts.substring(0, firstSlash) : pathParts;
              const targetPath = firstSlash > 0 ? pathParts.substring(firstSlash) : '/';
              proxyReq.setHeader('host', targetHost);
              proxyReq.path = targetPath;
            }
          });
        },
        router: (req) => {
          // Dynamic routing based on the path
          const pathParts = req.url?.split('/mcp-proxy/')[1];
          if (pathParts) {
            const firstSlash = pathParts.indexOf('/');
            const targetHost = firstSlash > 0 ? pathParts.substring(0, firstSlash) : pathParts;
            return `https://${targetHost}`;
          }
          return 'https://localhost';
        },
        rewrite: (path) => {
          // /mcp-proxy/aitools.emofid.com/mcp -> /mcp
          const pathParts = path.split('/mcp-proxy/')[1];
          if (pathParts) {
            const firstSlash = pathParts.indexOf('/');
            return firstSlash > 0 ? pathParts.substring(firstSlash) : '/';
          }
          return path;
        },
      },
    },
  },
  build: {
    target: 'ES2022',
    outDir: 'dist',
    sourcemap: true,
  },
});

