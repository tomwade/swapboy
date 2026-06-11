import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Neither upstream API sends CORS headers, so the browser talks to
// same-origin proxies: these dev-server proxies locally, the vercel.json
// rewrites in production. Auth headers are sent by the client itself.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/uniswap-api': {
        target: 'https://trade-api.gateway.uniswap.org',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/uniswap-api/, '/v1'),
      },
      '/flaunch-api': {
        target: 'https://api-v2.flayerlabs.xyz',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/flaunch-api/, ''),
      },
    },
  },
});
