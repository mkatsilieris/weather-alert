import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own service worker (src/sw.ts): it needs a push handler, which the generated one has no room for.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Weather Alert - Έρχεται βροχή;',
        short_name: 'Weather Alert',
        description: 'Ειδοποίηση όταν η βροχή πλησιάζει το σπίτι σου',
        lang: 'el',
        theme_color: '#0369a1',
        background_color: '#f3f4f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
