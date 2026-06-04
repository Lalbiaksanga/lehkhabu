import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PWAState {
  /** Whether the app is installable (beforeinstallprompt has fired) */
  isInstallable: boolean;
  /** Whether the app is running in standalone PWA mode */
  isStandalone: boolean;
  /** Whether a new service worker is waiting to activate */
  needsUpdate: boolean;
  /** Trigger the native install prompt */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Apply the pending SW update and reload */
  applyUpdate: () => void;
}

export function usePWA(): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true;

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Listen for SW updates via vite-plugin-pwa's virtual module events
  useEffect(() => {
    const handleSWUpdate = () => setNeedsUpdate(true);
    window.addEventListener('vite-plugin-pwa:sw-updated', handleSWUpdate);
    return () => window.removeEventListener('vite-plugin-pwa:sw-updated', handleSWUpdate);
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
    return outcome;
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          reg.waiting.addEventListener('statechange', (e) => {
            if ((e.target as ServiceWorker).state === 'activated') {
              window.location.reload();
            }
          });
        } else {
          window.location.reload();
        }
      });
    } else {
      window.location.reload();
    }
  }, []);

  return { isInstallable, isStandalone, needsUpdate, promptInstall, applyUpdate };
}
