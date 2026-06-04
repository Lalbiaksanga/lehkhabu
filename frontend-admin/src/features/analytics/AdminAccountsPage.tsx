import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, AlertCircle, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format, formatDistanceToNow } from 'date-fns';

const avatarColors = ['gold', 'blue', 'green', 'purple', 'red'];

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminAccountsPage() {
  const { addToast, adminRole } = useAdminContext();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('admin_accounts')
        .select('id, full_name, email, role, is_active, created_at, updated_at')
        .in('role', ['admin', 'readonly_admin'])
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAdmins(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load admin accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(admin: AdminUser) {
    setMutatingId(admin.id);
    try {
      const { error: err } = await supabase
        .from('admin_accounts')
        .update({ is_active: !admin.is_active, updated_at: new Date().toISOString() })
        .eq('id', admin.id);
      if (err) throw err;
      addToast(admin.is_active ? 'Admin account deactivated.' : 'Admin account activated!', admin.is_active ? 'error' : 'success');
      await load();
    } catch (e: any) {
      addToast(e.message ?? 'Failed to toggle admin status.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Admin Accounts</h1>
            <p>Users with admin or super-admin roles on the platform.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-admins-btn">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* Info Banner */}
      <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)' }}>
        <Shield size={16} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Admin access is granted by adding users to the{' '}
          <code style={{ color: 'var(--color-blue)', background: 'var(--color-blue-dim)', padding: '1px 6px', borderRadius: 4 }}>admin_accounts</code> table via the Supabase dashboard.
        </span>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-md)' }}>
        {[
          { label: 'Total Admins', value: loading ? '…' : admins.length, color: 'var(--color-gold)' },
          { label: 'Active', value: loading ? '…' : admins.filter(a => a.is_active).length, color: 'var(--color-green)' },
          { label: 'Read-Only', value: loading ? '…' : admins.filter(a => a.role === 'readonly_admin').length, color: 'var(--color-purple)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 8px ${s.color}` }} />
            <div>
              <div className="stat-card-label">{s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Admin List */}
      <div className="section-card animate-fade-in">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading admin accounts…</div>
          ) : admins.length === 0 ? (
            <div className="empty-state">
              <Users size={40} />
              <p>No admin accounts found.<br />Add a user to the <strong>admin_accounts</strong> table in the Supabase dashboard.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin, i) => (
                  <tr key={admin.id} style={{ opacity: mutatingId === admin.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`avatar avatar-md avatar-${avatarColors[i % avatarColors.length]}`}>
                          {(admin.full_name ?? admin.email ?? '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{admin.full_name || '—'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{admin.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${admin.role === 'admin' ? 'badge-admin' : 'badge-featured'}`}>
                        {admin.role === 'admin' ? '⭐ Full Admin' : 'Read-Only'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${admin.is_active ? 'approved' : 'rejected'}`}>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {format(new Date(admin.created_at), 'MMM d, yyyy')}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {formatDistanceToNow(new Date(admin.updated_at), { addSuffix: true })}
                    </td>
                    <td>
                      {adminRole !== 'readonly_admin' && (
                        <button
                          className="btn-icon"
                          disabled={mutatingId === admin.id}
                          onClick={() => handleToggle(admin)}
                          id={`toggle-admin-${admin.id}`}
                          title={admin.is_active ? 'Deactivate' : 'Activate'}
                          style={{ color: admin.is_active ? 'var(--color-green)' : 'var(--text-muted)' }}
                        >
                          {admin.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
