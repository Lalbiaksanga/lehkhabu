import { useState, useEffect, useCallback } from 'react';
import {
  Search, MoreVertical, ShieldBan, UserCheck, Eye,
  XCircle, RefreshCw, AlertCircle,
} from 'lucide-react';
import {
  fetchUsers, updateUserActive, updateUserRole,
  subscribeToUserChanges, type AdminUser,
} from '../../services/users.service';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format } from 'date-fns';

/* ── Config ────────────────────────────────────────────────────────── */

type RoleTab = 'all' | 'USER' | 'AUTHOR' | 'ADMIN';
type StatusTab = 'all' | 'active' | 'suspended';

const ROLE_TABS: { key: RoleTab; label: string }[] = [
  { key: 'all',    label: 'All Users' },
  { key: 'USER',   label: 'Readers' },
  { key: 'AUTHOR', label: 'Authors' },
  { key: 'ADMIN',  label: 'Admins' },
];

const AVATAR_COLORS = ['gold', 'blue', 'green', 'purple', 'red', 'cyan'];

const getRoleBadge = (role: AdminUser['role']) => {
  if (role === 'ADMIN')  return 'badge-admin';
  if (role === 'AUTHOR') return 'badge-featured';
  return 'badge-active';
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function UsersPage() {
  const { addToast, adminRole } = useAdminContext();
  const [users, setUsers]           = useState<AdminUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleTab>('all');
  const [activeStatus, setActiveStatus] = useState<StatusTab>('all');
  const [search, setSearch]         = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewUser, setViewUser]     = useState<AdminUser | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  /* ── Data loading ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Real-time: auto-refresh when users change ── */
  useEffect(() => {
    const channel = subscribeToUserChanges(() => {
      load();
    });
    return () => { channel.unsubscribe(); };
  }, [load]);

  /* ── Close menu on outside click ── */
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  /* ── Filtering ── */
  const filtered = users
    .filter(u => activeRole === 'all' || u.role === activeRole)
    .filter(u => {
      if (activeStatus === 'active')    return u.isActive;
      if (activeStatus === 'suspended') return !u.isActive;
      return true;
    })
    .filter(u =>
      (u.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username ?? '').toLowerCase().includes(search.toLowerCase())
    );

  /* ── Actions ── */
  async function toggleSuspend(user: AdminUser) {
    setMutatingId(user.id);
    setOpenMenuId(null);
    try {
      await updateUserActive(user.id, !user.isActive);
      addToast(
        user.isActive ? `${user.fullName} suspended.` : `${user.fullName} reactivated!`,
        user.isActive ? 'error' : 'success'
      );
      if (viewUser?.id === user.id) setViewUser(null);
      await load();
    } catch {
      addToast('Failed to update user status.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  async function changeRole(user: AdminUser, role: 'USER' | 'AUTHOR') {
    setMutatingId(user.id);
    setOpenMenuId(null);
    try {
      await updateUserRole(user.id, role);
      addToast(`${user.fullName}'s role updated to ${role}.`, 'success');
      await load();
    } catch (e: any) {
      addToast(e.message ?? 'Failed to update role.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  /* ── Stats ── */
  const stats = [
    { label: 'Total Users', value: users.length,                                 color: 'var(--color-blue)',   dim: 'var(--color-blue-dim)' },
    { label: 'Readers',     value: users.filter(u => u.role === 'USER').length,   color: 'var(--color-green)',  dim: 'var(--color-green-dim)' },
    { label: 'Authors',     value: users.filter(u => u.role === 'AUTHOR').length, color: 'var(--color-gold)',   dim: 'var(--color-gold-dim)' },
    { label: 'Suspended',   value: users.filter(u => !u.isActive).length,         color: 'var(--color-red)',    dim: 'var(--color-red-dim)' },
  ];

  /* ── Render ── */
  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Users</h1>
            <p>Manage platform readers, authors and administrators.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-users-btn">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-md)' }}>
        {stats.map(s => (
          <div key={s.label} className="stat-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 8px ${s.color}` }} />
            <div>
              <div className="stat-card-label">{s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                {loading ? '…' : s.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
        {/* Role tabs */}
        <div className="filter-tabs">
          {ROLE_TABS.map(t => (
            <button
              key={t.key}
              className={`filter-tab${activeRole === t.key ? ' active' : ''}`}
              onClick={() => setActiveRole(t.key)}
              id={`role-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Status tabs */}
        <div className="filter-tabs">
          {(['all', 'active', 'suspended'] as StatusTab[]).map(s => (
            <button
              key={s}
              className={`filter-tab${activeStatus === s ? ' active' : ''}`}
              onClick={() => setActiveStatus(s)}
              id={`status-tab-${s}`}
            >
              {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <Search />
          <input
            className="search-input"
            placeholder="Search name, username or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="users-search"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="section-card animate-fade-in">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><Search size={40} /><p>No users found.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Purchases</th>
                  <th>Total Spent</th>
                  <th>Joined</th>
                  <th>Email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <tr key={user.id} style={{ opacity: mutatingId === user.id ? 0.45 : 1, transition: 'opacity 0.2s' }}>
                    {/* User cell */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`avatar avatar-md avatar-${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                          {(user.fullName || user.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                            {user.fullName ?? user.username}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user.email}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{user.username}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td><span className={`badge ${getRoleBadge(user.role)}`}>{user.role}</span></td>

                    {/* Active status */}
                    <td>
                      <span className={`badge badge-${user.isActive ? 'approved' : 'rejected'}`}>
                        {user.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>

                    {/* Stats */}
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{user.purchaseCount}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)', fontWeight: 600 }}>
                      {user.totalSpent > 0 ? `₹${user.totalSpent.toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* Joined */}
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {format(new Date(user.createdAt), 'MMM d, yyyy')}
                    </td>

                    {/* Email verified */}
                    <td>
                      <span style={{ fontSize: '0.75rem', color: user.isEmailVerified ? 'var(--color-green)' : 'var(--text-muted)' }}>
                        {user.isEmailVerified ? '✓ Verified' : '✗ Unverified'}
                      </span>
                    </td>

                    {/* Actions menu */}
                    <td>
                      <div className="dropdown" style={{ position: 'relative' }}>
                        <button
                          className="btn-icon"
                          id={`user-menu-${user.id}`}
                          onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === user.id ? null : user.id); }}
                        >
                          <MoreVertical size={15} />
                        </button>

                        {openMenuId === user.id && (
                          <div className="dropdown-menu" onClick={e => e.stopPropagation()}>
                            {/* View profile */}
                            <div className="dropdown-item" onClick={() => { setViewUser(user); setOpenMenuId(null); }}>
                              <Eye size={14} /> View Profile
                            </div>

                            <div className="dropdown-divider" />

                            {/* Role management — ADMIN accounts are locked */}
                            {user.role === 'ADMIN' || adminRole === 'readonly_admin' ? (
                              <div className="dropdown-item" style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                                <UserCheck size={14} /> {adminRole === 'readonly_admin' ? 'Read-only Access' : 'Admin (cannot change)'}
                              </div>
                            ) : (
                              <>
                                {/* AUTHOR → promote only if they have an approved application */}
                                {user.role === 'USER' && (
                                  <div
                                    className="dropdown-item"
                                    onClick={() => changeRole(user, 'AUTHOR')}
                                  >
                                    <UserCheck size={14} /> Promote to Author
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 4 }}>(needs approved app)</span>
                                  </div>
                                )}
                                {/* AUTHOR → demote back to USER */}
                                {user.role === 'AUTHOR' && (
                                  <div className="dropdown-item" onClick={() => changeRole(user, 'USER')}>
                                    <UserCheck size={14} /> Demote to Reader
                                  </div>
                                )}
                              </>
                            )}

                            <div className="dropdown-divider" />

                            {/* Suspend / reactivate */}
                            {adminRole !== 'readonly_admin' && (
                              <div className="dropdown-item danger" onClick={() => toggleSuspend(user)}>
                                <ShieldBan size={14} /> {user.isActive ? 'Suspend' : 'Reactivate'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── User Profile Modal ── */}
      {viewUser && (
        <div className="modal-backdrop" onClick={() => setViewUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>User Profile</h3>
              <button className="btn-icon" onClick={() => setViewUser(null)} id="close-user-modal">
                <XCircle size={16} />
              </button>
            </div>

            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
              <div className="avatar avatar-lg avatar-gold" style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
                {(viewUser.fullName || viewUser.username || '?')[0].toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem' }}>{viewUser.fullName}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>@{viewUser.username}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{viewUser.email}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span className={`badge ${getRoleBadge(viewUser.role)}`}>{viewUser.role}</span>
                  <span className={`badge badge-${viewUser.isActive ? 'approved' : 'rejected'}`}>
                    {viewUser.isActive ? 'Active' : 'Suspended'}
                  </span>
                  {viewUser.isEmailVerified && <span className="badge badge-approved">Email Verified</span>}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Purchases',    value: viewUser.purchaseCount },
                { label: 'Total Spent',  value: `₹${viewUser.totalSpent.toLocaleString('en-IN')}` },
                { label: 'Followers',    value: viewUser.followersCount },
                { label: 'Following',    value: viewUser.followingCount },
                { label: 'Joined',       value: format(new Date(viewUser.createdAt), 'PPP') },
                { label: 'User ID',      value: viewUser.id.slice(0, 16) + '…' },
              ].map(item => (
                <div
                  key={item.label}
                  style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {viewUser.bio && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Bio</div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{viewUser.bio}</p>
              </div>
            )}

            <div className="modal-footer">
              {adminRole !== 'readonly_admin' && (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={mutatingId === viewUser.id || viewUser.role === 'ADMIN'}
                  onClick={() => toggleSuspend(viewUser)}
                >
                  <ShieldBan size={14} /> {viewUser.isActive ? 'Suspend' : 'Reactivate'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
