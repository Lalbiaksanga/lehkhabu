/**
 * Custom Service Worker for Lehkhabu
 *
 * Uses injectManifest strategy so we can add push notification
 * handlers alongside the standard Workbox precaching/runtime caching.
 *
 * Handles:
 *  - Precaching (injected by vite-plugin-pwa)
 *  - Runtime caching for Supabase API, Storage, Google Fonts
 *  - Push notification display
 *  - Notification click (open app)
 *  - SW skip waiting message
 */

import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// ── Core Setup ────────────────────────────────────────────────
clientsClaim();

// Precache all assets built by Vite (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Navigation Fallback ───────────────────────────────────────
try {
  const handler = createHandlerBoundToURL('/index.html');
  registerRoute(new NavigationRoute(handler, {
    denylist: [/^\/offline\.html$/],
  }));
} catch (err) {
  console.warn('Skipping SPA navigation route in dev mode');
}

// ── Runtime Caching ───────────────────────────────────────────

// Supabase API — NetworkFirst (8s timeout, 24h cache)
registerRoute(
  /^https:\/\/puwqymuuibpysixvkund\.supabase\.co\/.*/i,
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 8,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Supabase Storage (book covers) — StaleWhileRevalidate (30 days)
registerRoute(
  /^https:\/\/puwqymuuibpysixvkund\.supabase\.co\/storage\/.*/i,
  new StaleWhileRevalidate({
    cacheName: 'book-covers',
    plugins: [
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Google Fonts — CacheFirst (1 year, very stable)
registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Algolia — NetworkFirst (5s timeout, 5min cache)
registerRoute(
  /^https:\/\/.*\.algolia(net|\.com)\/.*/i,
  new NetworkFirst({
    cacheName: 'algolia-search',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 5 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Push Notifications ────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; url?: string; tag?: string };
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Lehkhabu', body: event.data.text() };
  }

  const title = data.title || 'Lehkhabu';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'lehkhabu-notification',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If app is already open, focus it
        for (const client of windowClients) {
          if ('focus' in client) return client.focus();
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── Skip Waiting ──────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
