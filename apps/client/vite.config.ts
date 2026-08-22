import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

function readRootPackage(): { version: string } {
  const parsed: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', 'package.json'), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || typeof parsed.version !== 'string') {
    throw new Error('package.json raíz debe declarar una versión de producto.');
  }
  return { version: parsed.version };
}

const rootPackage = readRootPackage();
const productVersionMatch = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(rootPackage.version);
if (productVersionMatch === null) throw new Error('La versión de producto no es válida.');
const major = Number(productVersionMatch[1]);
const minor = Number(productVersionMatch[2]);
const patch = Number(productVersionMatch[3]);
const localVersionCode = major * 1_000_000 + minor * 1_000 + patch + 1;

function buildValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? fallback : value;
}

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildValue('VITE_APP_VERSION', rootPackage.version)),
    'import.meta.env.VITE_APP_VERSION_CODE': JSON.stringify(buildValue('VITE_APP_VERSION_CODE', String(localVersionCode))),
    'import.meta.env.VITE_RELEASE_TAG': JSON.stringify(buildValue('VITE_RELEASE_TAG', `v${rootPackage.version}`)),
    'import.meta.env.VITE_UPDATE_MANIFEST_URL': JSON.stringify(buildValue('VITE_UPDATE_MANIFEST_URL', 'https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/latest.json')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'ChatInk — chat efimero',
        short_name: 'ChatInk',
        description: 'Salas temporales para texto, dibujos y archivos.',
        theme_color: '#6c5ce7',
        background_color: '#f5f3ff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
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
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4173 },
  // El bundle de distribución es público: no incluimos source maps para no publicar una
  // reconstrucción innecesaria del fuente. El servidor de desarrollo conserva su depuración.
  build: { sourcemap: mode !== 'production', target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
}));
