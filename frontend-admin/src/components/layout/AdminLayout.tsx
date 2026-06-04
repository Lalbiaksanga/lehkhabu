import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Users, UserCheck, BarChart3,
  Settings, Bell, Search, Menu, X, LogOut, ChevronDown,
  Megaphone, ShoppingCart, Star, Sliders, ClipboardList,
} from 'lucide-react';
import { fetchDashboardStats, type DashboardStats } from '../../services/analytics.service';
import { subscribeToApplicationChanges } from '../../services/users.service';
import { supabase } from '../../lib/supabase';
import '../../App.css';

/* ── Admin Context ──────────────────────────────────────────────── */
interface Toast { id: string; message: string; type: 'success' | 'error' | 'info'; }
interface AdminCtx { 
  addToast: (msg: string, type?: Toast['type']) => void;
  adminRole: string;
}
export const AdminContext = createContext<AdminCtx>({ addToast: () => {}, adminRole: 'readonly_admin' });
export function useAdminContext() { return useContext(AdminContext); }

/* ── Nav Items ──────────────────────────────────────────────────── */
const mainNav = [
  { to: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/books',        label: 'Books',        icon: BookOpen,       badgeKey: 'pendingBooks' },
  { to: '/authors',      label: 'Authors',      icon: Star },
  { to: '/users',        label: 'Users',        icon: Users },
  { to: '/applications', label: 'Applications', icon: ClipboardList,  badgeKey: 'pendingApplications' },
  { to: '/orders',       label: 'Orders',       icon: ShoppingCart },
  { to: '/analytics',    label: 'Analytics',    icon: BarChart3 },
];
const managementNav = [
  { to: '/admins',        label: 'Admin Accounts',  icon: UserCheck },
  { to: '/announcements', label: 'Announcements',   icon: Megaphone },
  { to: '/settings',      label: 'Settings',        icon: Settings },
];

/* ── Sidebar ────────────────────────────────────────────────────── */
function Sidebar({
  open, onClose, stats, adminName, adminEmail
}: {
  open: boolean;
  onClose: () => void;
  stats: DashboardStats | null;
  adminName: string;
  adminEmail: string;
}) {
  const location = useLocation();

  return (
    <>
      {open && <div className="sidebar-mobile-overlay show" onClick={onClose} />}
      <aside className={`admin-sidebar${open ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon"><BookOpen size={18} /></div>
          <span className="sidebar-logo-text">Lehkhabu</span>
          <span className="sidebar-logo-badge">ADMIN</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Main</span>
          {mainNav.map(item => {
            const Icon = item.icon;
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);
            const badgeValue = item.badgeKey && stats ? (stats[item.badgeKey as keyof DashboardStats] as number) : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-link${isActive ? ' active' : ''}`}
                onClick={onClose}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {badgeValue > 0 ? <span className="nav-link-badge">{badgeValue}</span> : null}
              </NavLink>
            );
          })}

          <span className="sidebar-section-label" style={{ marginTop: 12 }}>Management</span>
          {managementNav.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-link${isActive ? ' active' : ''}`}
                onClick={onClose}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar avatar-sm avatar-gold" style={{ fontSize: '0.78rem' }}>
              {adminName[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{adminName || 'Admin'}</div>
              <div className="sidebar-user-role">{adminEmail || ''}</div>
            </div>
            <ChevronDown size={14} className="sidebar-user-chevron" />
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Top Bar ────────────────────────────────────────────────────── */
function TopBar({
  onMenuClick,
  pendingApps,
  adminRole,
}: {
  onMenuClick: () => void;
  pendingApps: number;
  adminRole: string;
}) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const pageTitles: Record<string, string> = {
    '/':             'Dashboard',
    '/books':        'Books',
    '/authors':      'Authors',
    '/users':        'Users',
    '/applications': 'Author Applications',
    '/orders':       'Orders',
    '/analytics':    'Analytics',
    '/announcements': 'Announcements',
    '/settings':     'Platform Settings',
    '/admins':       'Admin Accounts',
  };
  const title = pageTitles[location.pathname] ?? 'Admin';

  useEffect(() => {
    const handler = () => setNotifOpen(false);
    if (notifOpen) document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, [notifOpen]);

  return (
    <header className="admin-topbar">
      <div className="topbar-left">
        <button className="btn-icon hide-desktop" onClick={onMenuClick} id="sidebar-toggle-btn">
          <Menu size={18} />
        </button>
        <div>
          <div className="topbar-page-title">
            {title}
            {adminRole && (
              <span style={{
                marginLeft: 10, fontSize: '0.62rem', fontWeight: 600,
                letterSpacing: '0.5px', textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 'var(--radius-full)',
                background: adminRole === 'super_admin' ? 'rgba(239,68,68,0.15)' : 'rgba(193,120,23,0.15)',
                color: adminRole === 'super_admin' ? '#f87171' : 'var(--color-gold)',
                border: `1px solid ${adminRole === 'super_admin' ? 'rgba(239,68,68,0.3)' : 'rgba(193,120,23,0.3)'}`,
                verticalAlign: 'middle',
              }}>
                {adminRole.replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="topbar-breadcrumb hide-mobile">
            Admin <span>›</span> <span style={{ color: 'var(--text-primary)' }}>{title}</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        {/* Search */}
        <div className="topbar-search hide-mobile">
          <div className="search-box">
            <Search />
            <input className="search-input" placeholder="Quick search…" style={{ width: 200 }} />
          </div>
        </div>

        {/* Notifications bell — shows real pending application count */}
        <div
          className="dropdown"
          style={{ position: 'relative' }}
          onClick={e => { e.stopPropagation(); setNotifOpen(v => !v); }}
        >
          <button className="notification-btn" id="notif-btn" style={{ position: 'relative' }}>
            <Bell size={17} />
            {pendingApps > 0 && (
              <span
                className="notif-dot"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--color-orange)',
                  border: '2px solid var(--bg-sidebar)',
                }}
              />
            )}
          </button>

          {notifOpen && (
            <div className="dropdown-menu" style={{ width: 300 }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '8px 12px 6px', fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Notifications
              </div>

              {pendingApps > 0 ? (
                <div
                  className="dropdown-item"
                  style={{ alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                  onClick={() => { navigate('/applications'); setNotifOpen(false); }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-orange)', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {pendingApps} author application{pendingApps > 1 ? 's' : ''} pending review
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Click to review applications →
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 14px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  No pending notifications.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          className="btn btn-ghost btn-sm"
          id="topbar-signout-btn"
          style={{ gap: 6 }}
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
        >
          <LogOut size={15} />
          <span className="hide-mobile">Sign out</span>
        </button>
      </div>
    </header>
  );
}

/* ── Toast Component ────────────────────────────────────────────── */
function ToastContainer({ toasts, remove }: { toasts: Toast[]; remove: (id: string) => void }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => remove(t.id)}>
          <div className="toast-icon">
            {t.type === 'success' && <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth={2.5}><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {t.type === 'error'   && <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-red)"   strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {t.type === 'info'    && <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-blue)"  strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" strokeLinecap="round"/></svg>}
          </div>
          <span style={{ fontSize: '0.875rem' }}>{t.message}</span>
          <button onClick={() => remove(t.id)} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}><X size={14}/></button>
        </div>
      ))}
    </div>
  );
}

/* ── Main Admin Layout ──────────────────────────────────────────── */
export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts]           = useState<Toast[]>([]);
  const [stats, setStats]             = useState<DashboardStats | null>(null);
  const [adminName,  setAdminName]    = useState('');
  const [adminEmail, setAdminEmail]   = useState('');
  const [adminRole,  setAdminRole]    = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard: verify user is logged in AND has admin role in the users table
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      // Check admin_accounts for admin/readonly_admin
      const { data: adminRow } = await supabase
        .from('admin_accounts')
        .select('id, full_name, role, email')
        .eq('id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!adminRow || !['super_admin', 'admin', 'readonly_admin'].includes(adminRow.role ?? '')) {
        // Not an active admin — sign out and redirect
        await supabase.auth.signOut();
        navigate('/login', { replace: true });
        return;
      }
      setAdminName(adminRow.full_name || session.user.email || 'Admin');
      setAdminEmail(adminRow.email || session.user.email || '');
      setAdminRole(adminRow.role || 'readonly_admin');
      setAuthChecked(true);
    });
  }, [navigate]);

  const loadStats = useCallback(() => {
    fetchDashboardStats().then(setStats).catch((err) => {
      console.error('Failed to load dashboard stats:', err);
    });
  }, []);

  // Initial load (only after auth check)
  useEffect(() => { if (authChecked) loadStats(); }, [loadStats, authChecked]);

  // Real-time: refresh badge when applications change — only after auth confirmed
  useEffect(() => {
    if (!authChecked) return;
    const channel = subscribeToApplicationChanges(() => {
      loadStats();
    });
    return () => { channel.unsubscribe(); };
  }, [loadStats, authChecked]);

  // Toast helpers
  const addToast = (message: string, type: Toast['type'] = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const pendingApps = stats?.pendingApplications ?? 0;

  // Show loading spinner while checking auth
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-body)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verifying admin access…</div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ addToast, adminRole }}>
      <div className="admin-shell">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          stats={stats}
          adminName={adminName}
          adminEmail={adminEmail}
        />
        <div className="admin-main">
          <TopBar onMenuClick={() => setSidebarOpen(true)} pendingApps={pendingApps} adminRole={adminRole} />
          <div className="admin-page">
            <Outlet />
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} remove={removeToast} />
    </AdminContext.Provider>
  );
}
