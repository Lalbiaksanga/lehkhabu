/**
 * usePushNotifications
 *
 * Handles the full Web Push subscription lifecycle:
 *  1. Check if the browser supports push notifications
 *  2. Request permission from the user (only called when triggered)
 *  3. Subscribe the browser to Web Push using the VAPID public key
 *  4. Save the PushSubscription to Supabase user_push_tokens table
 *
 * Usage: Call `registerPush()` after login, or when user explicitly opts in.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

/** Convert a base64url VAPID public key to a Uint8Array for the browser API */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export type PushStatus = 'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported' | 'error';

export function usePushNotifications() {
  const { profile } = useAuthStore();
  const [status, setStatus] = useState<PushStatus>('idle');

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // On mount, check if already subscribed/denied
  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
    } else if (Notification.permission === 'granted') {
      setStatus('subscribed');
    }
  }, [isSupported]);

  const registerPush = useCallback(async () => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }
    if (!profile?.id) return;
    if (!VAPID_PUBLIC_KEY) {
      console.warn('[Push] VITE_VAPID_PUBLIC_KEY is not set. Skipping push registration.');
      return;
    }

    try {
      setStatus('loading');

      // 1. Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      // 2. Get the service worker registration
      let swReg = await navigator.serviceWorker.getRegistration();
      if (!swReg) {
        console.warn("No SW found via getRegistration(). Attempting manual registration...");
        try {
          swReg = await navigator.serviceWorker.register(
            import.meta.env.DEV ? '/src/sw.ts' : '/sw.js', 
            { type: import.meta.env.DEV ? 'module' : 'classic' }
          );
        } catch (e) {
          console.error("Manual registration failed:", e);
        }
      }

      if (!swReg) {
        throw new Error("No Service Worker registered! Vite PWA is not running properly.");
      }

      // 3. Subscribe to Web Push
      const subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const { endpoint, keys } = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      // 4. Save subscription to Supabase (upsert on conflict)
      const { data, error } = await supabase.from('user_push_tokens').upsert(
        {
          user_id: profile.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      ).select();

      if (error || !data || data.length === 0) {
        throw new Error(error?.message || "Database silently rejected the push token. RLS policy blocked it.");
      }

      setStatus('subscribed');
      console.log('[Push] Successfully registered for push notifications.');
    } catch (err) {
      console.error('[Push] Registration error:', err);
      setStatus('error');
      throw err;
    }
  }, [isSupported, profile?.id]);

  return { status, isSupported, registerPush };
}
