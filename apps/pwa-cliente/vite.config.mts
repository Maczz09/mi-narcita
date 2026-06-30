/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/pwa-cliente',
  server: {
    port: 4200,
    host: 'localhost',
    proxy: {
      '/v1/identidad': { target: 'http://localhost:3001', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/identidad/, '/api') },
      '/v1/mesas': { target: 'http://localhost:3002', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/mesas/, '/api') },
      '/v1/pedidos': { target: 'http://localhost:3004', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/pedidos/, '/api') },
      '/v1/cuentas': { target: 'http://localhost:3005', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/cuentas/, '/api') },
      '/v1/reservas': { target: 'http://localhost:3006', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/reservas/, '/api') },
      '/v1/inventario': { target: 'http://localhost:3007', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/inventario/, '/api') },
      '/v1/notificaciones': { target: 'http://localhost:3008', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/notificaciones/, '/api') },
      '/v1/caja': { target: 'http://localhost:3009', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/caja/, '/api') },
      '/v1/reportes': { target: 'http://localhost:3010', changeOrigin: true, rewrite: (path) => path.replace(/^\/v1\/reportes/, '/api') },
      '/notificaciones': { target: 'http://localhost:3008', changeOrigin: true, ws: true, rewrite: (path) => path.replace(/^\/notificaciones/, '/api') },
    }
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/pwa-cliente',
      provider: 'v8',
      reporter: ['lcov', 'text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.spec.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
  define: {
    'import.meta.vitest': undefined,
  },
}));
