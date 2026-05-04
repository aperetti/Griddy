import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@plugin-sdk': path.resolve(__dirname, './src/plugins/sdk')
      }
    },
    server: {
      port: env.PORT ? parseInt(env.PORT) : 3001,
      host: true,
      watch: {
        usePolling: true,
      },
      hmr: {
        clientPort: env.HMR_PORT ? parseInt(env.HMR_PORT) : 8080,
      },
      proxy: {
        '/api/display-rules': {
          target: env.VITE_API_PROXY_TARGET || 'http://backend:8000',
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (_proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/admin-api': {
          target: env.VITE_ADMIN_API_PROXY_TARGET || 'http://admin-backend:8090',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/admin-api/, '/api'),
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('admin proxy error', err);
            });
          },
        },
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://backend:8000',
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (_proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/docs': {
          target: env.VITE_DOCS_PROXY_TARGET || 'http://localhost:3002',
          changeOrigin: true
        }
      }
    }
  }
})
