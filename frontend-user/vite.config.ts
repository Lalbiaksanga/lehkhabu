import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
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
        enabled: false,
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
