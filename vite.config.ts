import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: "NOR AI — مساعد نور الذكي",
        short_name: "NOR AI",
        description: "Voice-first visual assistance for blind and visually impaired users",
        theme_color: "#050816",
        background_color: "#050816",
        display: "standalone",
        start_url: "/",
        id: "/",
        orientation: "portrait",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        // Do not precache index.html. Otherwise an installed PWA can stay on
        // an old app shell after a release even though the new JS is deployed.
        // Hash routes need no navigation fallback, so the fresh HTML is always
        // fetched from Vercel on the next launch.
        globPatterns: ['**/*.{js,css,ico,png,svg,mp4,woff2,ttf}'],
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 10485760 // 10MB to cover video if needed
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
