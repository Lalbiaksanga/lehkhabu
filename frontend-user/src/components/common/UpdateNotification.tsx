import { usePWA } from '../../hooks/usePWA';

/**
 * Update notification toast — shown when a new version of the service worker is waiting.
 * Appears at the bottom of the screen with a non-intrusive prompt.
 */
export default function UpdateNotification() {
  const { needsUpdate, applyUpdate } = usePWA();

  if (!needsUpdate) return null;

  return (
    <div className="pwa-update-toast" role="alert" aria-live="polite">
      <div className="pwa-update-toast-icon" aria-hidden="true">✨</div>
      <div className="pwa-update-toast-text">
        <div className="pwa-update-toast-title">Update available</div>
        <div className="pwa-update-toast-sub">A new version of Lehkhabu is ready</div>
      </div>
      <button className="pwa-update-btn" onClick={applyUpdate} aria-label="Reload to update">
        Update
      </button>
    </div>
  );
}
