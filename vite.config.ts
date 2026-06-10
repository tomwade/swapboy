import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // '' prefix loads non-VITE_ vars too; UNISWAP_API_KEY stays out of the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/uniswap-api': {
          target: 'https://trade-api.gateway.uniswap.org',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/uniswap-api/, '/v1'),
          headers: { 'x-api-key': env.UNISWAP_API_KEY ?? '' },
        },
      },
    },
  };
});
