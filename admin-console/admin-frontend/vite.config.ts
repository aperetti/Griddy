import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: env.PORT ? parseInt(env.PORT) : 8091,
      host: true,
      watch: {
        usePolling: true,
      },
      hmr: {
        clientPort: env.HMR_PORT ? parseInt(env.HMR_PORT) : 8091,
      },
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://admin-backend:8090',
          changeOrigin: true,
        }
      }
    }
  }
})

