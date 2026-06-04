import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from './store/authStore';
import './assets/styles/index.css';
import './assets/styles/App.css';

// Initialize auth session immediately (non-blocking)
useAuthStore.getState().initialize();

// Register Service Worker for Push Notifications
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch((err) => console.error('Failed to register SW:', err));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
