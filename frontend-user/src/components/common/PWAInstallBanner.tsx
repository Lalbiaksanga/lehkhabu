import { useState } from 'react';
import { usePWA } from '../../hooks/usePWA';

/**
 * PWA Install Banner — shown when the app is installable and not yet in standalone mode.
 * Sits at the top of the screen, dismissible, with a premium feel.
 */
export default function PWAInstallBanner() {
  const { isInstallable, isStandalone, promptInstall } = usePWA();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('pwa-install-dismissed') === 'true';
  });
  const [installing, setInstalling] = useState(false);

  // Don't show if: already installed, not installable, or user dismissed
  if (isStandalone || !isInstallable || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === 'dismissed') {
      // Don't show again this session
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  return (
    <div className="pwa-install-banner" role="banner" aria-label="Install app">
      <div className="pwa-install-banner-icon" aria-hidden="true">📚</div>
      <div className="pwa-install-banner-text">
        <div className="pwa-install-banner-title">Install Lehkhabu</div>
        <div className="pwa-install-banner-sub">Read anywhere, even offline</div>
      </div>
      <div className="pwa-install-banner-actions">
        <button
          className="pwa-install-btn"
          onClick={handleInstall}
          disabled={installing}
          aria-label="Install app"
        >
          {installing ? '…' : 'Install'}
        </button>
        <button
          className="pwa-install-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
