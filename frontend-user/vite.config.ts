import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/offline\.html$/],
        runtimeCaching: [
          // Supabase API — network-first with offline fallback
          {
            urlPattern: /^https:\/\/puwqymuuibpysixvkund\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase storage (book covers) — stale-while-revalidate
          {
            urlPattern: /^https:\/\/puwqymuuibpysixvkund\.supabase\.co\/storage\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'book-covers',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts — cache-first (very stable)
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Algolia — network-first
          {
            urlPattern: /^https:\/\/.*\.algolia(net|\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'algolia-search',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Offline fallback for navigation
        offlineGoogleAnalytics: false,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Lehkhabu — Read, Discover, Collect',
        short_name: 'Lehkhabu',
        description: 'Your AI-powered book marketplace. Discover, read, and collect your favorite books.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#8B5E3C',
        background_color: '#FDF6EC',
        lang: 'en',
        categories: ['books', 'education', 'entertainment'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Explore Books',
            short_name: 'Explore',
            description: 'Browse and search for books',
            url: '/explore',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'My Library',
            short_name: 'Library',
            description: 'View your personal library',
            url: '/library',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      devOptions: {
        enabled: false, // disable in dev to avoid noise
      },
    }),
  ],
  // Load .env from monorepo root (one directory up)
  envDir: path.resolve(__dirname, '..'),
  build: {
    // Vite 8 uses lightningcss for CSS minification by default.
    // lightningcss has a known bug crashing on @keyframes with box-shadow
    // in nested contexts. Disable CSS minify — CSS gzip compresses well (~85%)
    // and all selectors are already efficient.
    cssMinify: false,
    rollupOptions: {
      output: {
        // Split large vendor chunks for better caching
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
            if (id.includes('react-router')) return 'router';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('algoliasearch') || id.includes('react-instantsearch') || id.includes('@algolia')) return 'algolia';
          }
        },
      },
    },
  },
})
