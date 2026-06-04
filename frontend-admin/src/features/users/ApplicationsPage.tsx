import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  Search, BookOpen, RefreshCw, AlertCircle, ExternalLink,
} from 'lucide-react';
import {
  fetchApplications,
  approveApplication,
  rejectApplication,
  subscribeToApplicationChanges,
  type AdminApplication,
} from '../../services/users.service';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format } from 'date-fns';

/* ── Config ─────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<AdminApplication['status'], string> = {
  PENDING:  'var(--color-orange)',
  APPROVED: 'var(--color-green)',
  REJECTED: 'var(--color-red)',
};
const STATUS_BG: Record<AdminApplication['status'], string> = {
  PENDING:  'var(--color-orange-dim)',
  APPROVED: 'var(--color-green-dim)',
  REJECTED: 'var(--color-red-dim)',
};
const STATUS_LABEL: Record<AdminApplication['status'], string> = {
  PENDING:  '⏳ Pending',
  APPROVED: '✅ Approved',
  REJECTED: '❌ Rejected',
};

const AVATAR_COLORS = ['#C17817', '#4F8EF7', '#34D399', '#A78BFA', '#F87171', '#FB923C', '#22D3EE'];

/* ── Component ──────────────────────────────────────────────────── */

export default function ApplicationsPage() {
  const { addToast, adminRole } = useAdminContext();
  const [apps, setApps]           = useState<AdminApplication[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [filter, setFilter]       = useState<AdminApplication['status'] | 'all'>('all');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectNote, setRejectNote]   = useState('');
  const [mutatingId, setMutatingId]   = useState<string | null>(null);

  /* ── Data ── */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await fetchApplications());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Real-time: listen for any insert or update on applications ── */
  useEffect(() => {
    const channel = subscribeToApplicationChanges(() => {
      load();
    });
    return () => { channel.unsubscribe(); };
  }, [load]);

  /* ── Derived ── */
  const filtered = apps.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter;
    const matchSearch = a.userName.toLowerCase().includes(search.toLowerCase()) ||
                        a.userEmail.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all:      apps.length,
    PENDING:  apps.filter(a => a.status === 'PENDING').length,
    APPROVED: apps.filter(a => a.status === 'APPROVED').length,
    REJECTED: apps.filter(a => a.status === 'REJECTED').length,
  };

  /* ── Actions ── */
  async function handleApprove(app: AdminApplication) {
    setMutatingId(app.id);
    try {
      await approveApplication(app.id, app.userId);
      addToast(`${app.userName} approved — role upgraded to Author!`, 'success');
      setExpanded(null);
      await load();
    } catch (e: any) {
      addToast(e.message ?? 'Failed to approve application.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  async function handleReject(id: string) {
    setMutatingId(id);
    try {
      await rejectApplication(id, rejectNote || undefined);
      addToast('Application rejected. The applicant has been notified.', 'info');
      setRejectModal(null);
      setRejectNote('');
      setExpanded(null);
      await load();
    } catch (e: any) {
      addToast(e.message ?? 'Failed to reject application.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  /* ── Render ── */
  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Author Applications</h1>
            <p>Review and manage author applications submitted by users.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-apps-btn">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-md)' }}>
        {[
          { label: 'Total',    value: counts.all,      color: 'var(--color-blue)',   dim: 'var(--color-blue-dim)' },
          { label: 'Pending',  value: counts.PENDING,  color: 'var(--color-orange)', dim: 'var(--color-orange-dim)' },
          { label: 'Approved', value: counts.APPROVED, color: 'var(--color-green)',  dim: 'var(--color-green-dim)' },
          { label: 'Rejected', value: counts.REJECTED, color: 'var(--color-red)',    dim: 'var(--color-red-dim)' },
        ].map(s => (
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
        <div className="filter-tabs">
          {(['all', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
            <button
              key={f}
              className={`filter-tab${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
              id={`app-filter-${f}`}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
              {f !== 'all' && counts[f] > 0 && (
                <span className="nav-link-badge" style={{ marginLeft: 4, background: STATUS_COLORS[f] }}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <Search />
          <input
            className="search-input"
            placeholder="Search applicant name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="apps-search"
          />
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {loading ? (
          <div className="section-card" style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading applications…
          </div>
        ) : filtered.length === 0 ? (
          <div className="section-card">
            <div className="empty-state"><BookOpen size={40} /><p>No applications found.</p></div>
          </div>
        ) : filtered.map((app, i) => {
          const isExpanded = expanded === app.id;
          const isMutating = mutatingId === app.id;

          return (
            <div
              key={app.id}
              className="section-card animate-fade-in"
              style={{ opacity: isMutating ? 0.5 : 1, transition: 'opacity 0.2s' }}
            >
              {/* ── Card header ── */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', cursor: 'pointer', padding: 'var(--space-md)' }}
                onClick={() => setExpanded(isExpanded ? null : app.id)}
              >
                {/* Avatar */}
                <div
                  className="avatar avatar-md"
                  style={{
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    color: '#fff',
                    fontWeight: 700,
                    width: 40, height: 40, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {app.userName[0].toUpperCase()}
                </div>

                {/* User info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{app.userName}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{app.userEmail}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Genre: <strong>{app.genre}</strong> · Submitted: {format(new Date(app.submittedAt), 'MMM d, yyyy')}
                  </div>
                </div>

                {/* Status badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                      color: STATUS_COLORS[app.status],
                      background: STATUS_BG[app.status],
                    }}
                  >
                    {STATUS_LABEL[app.status]}
                  </span>
                  {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  {/* Writing sample */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      Writing Sample
                    </div>
                    <p style={{
                      background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)', fontSize: '0.875rem',
                      color: 'var(--text-secondary)', lineHeight: 1.7,
                      maxHeight: 160, overflowY: 'auto',
                    }}>
                      {app.writingSample}
                    </p>
                  </div>

                  {/* Motivation */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      Motivation
                    </div>
                    <p style={{
                      background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)', fontSize: '0.875rem',
                      color: 'var(--text-secondary)', lineHeight: 1.7,
                    }}>
                      {app.motivation}
                    </p>
                  </div>

                  {/* Uploaded file */}
                  {app.sampleFileName && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                        Sample File
                      </div>
                      <a
                        href={app.sampleFileUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                          color: 'var(--color-blue)', fontSize: '0.85rem', fontWeight: 500,
                          textDecoration: 'none',
                        }}
                      >
                        📄 {app.sampleFileName}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  {/* Social links */}
                  {app.socialLinks && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      🔗 {app.socialLinks}
                    </div>
                  )}

                  {/* Admin notes (if rejected) */}
                  {app.status === 'REJECTED' && app.adminNotes && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid var(--color-red)',
                      fontSize: '0.85rem', color: 'var(--color-red)',
                    }}>
                      <strong>Rejection note:</strong> {app.adminNotes}
                    </div>
                  )}

                  {/* Action buttons (only for PENDING) */}
                  {adminRole !== 'readonly_admin' && app.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={isMutating}
                        onClick={() => handleApprove(app)}
                        id={`approve-btn-${app.id}`}
                      >
                        <CheckCircle size={14} /> Approve & Promote to Author
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={isMutating}
                        onClick={() => { setRejectModal(app.id); }}
                        id={`reject-btn-${app.id}`}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="modal-backdrop" onClick={() => { setRejectModal(null); setRejectNote(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Reject Application</h3>
              <button className="btn-icon" onClick={() => { setRejectModal(null); setRejectNote(''); }}>
                <XCircle size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
              You may optionally provide a note to the applicant explaining your decision. They will receive an in-app notification.
            </p>
            <textarea
              className="app-textarea"
              rows={4}
              placeholder="Optional: explain why the application was rejected…"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              style={{ width: '100%', marginBottom: 'var(--space-md)', boxSizing: 'border-box' }}
            />
            <div className="modal-footer">
              <button
                className="btn btn-danger btn-sm"
                disabled={mutatingId === rejectModal}
                onClick={() => handleReject(rejectModal)}
                id="confirm-reject-btn"
              >
                <XCircle size={14} /> Confirm Rejection
              </button>
              <button className="btn btn-secondary" onClick={() => { setRejectModal(null); setRejectNote(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
