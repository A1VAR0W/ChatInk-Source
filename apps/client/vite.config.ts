import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Chat-Ink — chat efimero',
        short_name: 'Chat-Ink',
        description: 'Salas temporales para texto, dibujos y archivos.',
        theme_color: '#6c5ce7',
        background_color: '#f5f3ff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4173 },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
