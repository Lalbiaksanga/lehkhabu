import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useNotifications } from '../../hooks/useNotifications';
import PWAInstallBanner from '../common/PWAInstallBanner';
import UpdateNotification from '../common/UpdateNotification';

/* Only 4 nav items — Author Dashboard access lives in Profile page */
const NAV_ITEMS = [
  {
    to: '/', label: 'Home', end: true,
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: '/explore', label: 'Explore', end: false,
    icon: (_active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    to: '/library', label: 'Library', end: false,
    icon: (_active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
  },
  {
    to: '/profile', label: 'Profile', end: false,
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="notif-bell-wrap">
      <button
        className="top-header-btn notif-bell-btn"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-dropdown">
            <div className="notif-dropdown-header">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button
                  className="notif-mark-all"
                  onClick={() => { markAllRead(); setOpen(false); }}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="notif-list">
              {notifications.length === 0 && (
                <div className="notif-empty">No notifications yet</div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.is_read ? '' : 'notif-item-unread'}`}
                  onClick={async () => {
                    await markRead(n.id);
                    setOpen(false);
                    if (n.type === 'AUTHOR_APPROVED') navigate('/author');
                  }}
                >
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-msg">{n.message}</div>
                  <div className="notif-item-time">
                    {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const { approvalPopup, dismissPopup } = useNotifications();

  const displayInitial =
    profile?.full_name?.[0]?.toUpperCase() ??
    profile?.username?.[0]?.toUpperCase() ??
    '?';

  return (
    <div className="app-layout">
      {/* ── PWA Install Banner ────────────────────────────────── */}
      <PWAInstallBanner />

      {/* ── Approval Popup ──────────────────────────────────────── */}
      {approvalPopup && (
        <div className="author-approval-popup">
          <div className="author-approval-popup-inner">
            <div className="author-approval-popup-icon">🎉</div>
            <div className="author-approval-popup-body">
              <div className="author-approval-popup-title">{approvalPopup.title}</div>
              <div className="author-approval-popup-msg">{approvalPopup.message}</div>
              <div className="author-approval-popup-actions">
                <button
                  className="btn-author-primary btn-sm"
                  onClick={() => { dismissPopup(); navigate('/author'); }}
                >
                  Go to Dashboard →
                </button>
                <button className="app-back-btn btn-sm" onClick={dismissPopup}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Header ──────────────────────────────────────────── */}
      <header className="top-header">
        <div className="top-header-inner">
          <div
            className="top-header-logo"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            Lehkha<span>bu</span>
          </div>

          <div className="top-header-actions">
            <NavLink to="/explore" className="top-header-btn" aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </NavLink>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Avatar tap → Profile page */}
            <button
              className="top-header-avatar"
              aria-label="Go to profile"
              onClick={() => navigate('/profile')}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'User'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  loading="lazy"
                />
              ) : (
                displayInitial
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="app-content">
        <Outlet />
      </main>

      {/* ── Bottom Navigation (4 items, no Author) ─────────────── */}
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {({ isActive }) => (
              <>
                {item.icon(isActive)}
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── PWA Update Toast ──────────────────────────────────────── */}
      <UpdateNotification />
    </div>
  );
}
