import { useState, useEffect, useCallback } from 'react';
import { Search, BookOpen, RefreshCw, AlertCircle, Eye, XCircle } from 'lucide-react';
import { fetchAuthors, type AdminAuthorProfile } from '../../services/users.service';

import { format } from 'date-fns';

const avatarColors = ['gold', 'blue', 'green', 'purple', 'red', 'cyan'];

export default function AuthorsPage() {
  const [authors, setAuthors] = useState<AdminAuthorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewAuthor, setViewAuthor] = useState<AdminAuthorProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthors();
      setAuthors(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load authors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = authors.filter(a =>
    (a.user?.fullName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.user?.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.user?.username ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Authors</h1>
            <p>All verified authors on the Lehkhabu platform.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-authors-btn">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-md)' }}>
        {[
          { label: 'Total Authors', value: loading ? '…' : authors.length, color: 'var(--color-gold)' },
          { label: 'Total Books', value: loading ? '…' : authors.reduce((s, a) => s + a.totalBooks, 0), color: 'var(--color-blue)' },
          { label: 'Total Sales', value: loading ? '…' : authors.reduce((s, a) => s + a.totalSales, 0), color: 'var(--color-green)' },
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

      {/* Search */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="search-box">
          <Search />
          <input className="search-input" placeholder="Search authors…"
            value={search} onChange={e => setSearch(e.target.value)} id="authors-search" />
        </div>
      </div>

      {/* Table */}
      <div className="section-card animate-fade-in">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading authors…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><BookOpen size={40} /><p>No authors found.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Author</th>
                  <th>Pen Name</th>
                  <th>Books</th>
                  <th>Total Sales</th>
                  <th>Revenue</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((author, i) => {
                  const name = author.user?.fullName ?? author.user?.username ?? 'Unknown';
                  return (
                    <tr key={author.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {author.user?.avatarUrl ? (
                            <img src={author.user.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div className={`avatar avatar-sm avatar-${avatarColors[i % avatarColors.length]}`}>
                              {name[0]}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{author.user?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{author.penName ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{author.totalBooks}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{author.totalSales}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-green)', fontWeight: 600 }}>
                        {author.totalSales > 0 ? `${author.totalSales} sales` : '—'}
                      </td>
                      <td>
                        <span className={`badge badge-${author.user?.isActive ? 'approved' : 'rejected'}`}>
                          {author.user?.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {format(new Date(author.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => setViewAuthor(author)} id={`view-author-${author.id}`}>
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Author Detail Modal */}
      {viewAuthor && (
        <div className="modal-backdrop" onClick={() => setViewAuthor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Author Profile</h3>
              <button className="btn-icon" onClick={() => setViewAuthor(null)} id="close-author-modal"><XCircle size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
              <div className="avatar avatar-lg avatar-gold" style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
                {(viewAuthor.user?.fullName ?? viewAuthor.user?.username ?? '?')[0]}
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem' }}>{viewAuthor.user?.fullName ?? viewAuthor.user?.username}</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{viewAuthor.user?.email}</div>
                {viewAuthor.penName && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>Pen name: {viewAuthor.penName}</div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Total Books', value: viewAuthor.totalBooks },
                { label: 'Total Sales', value: viewAuthor.totalSales },
                { label: 'Website', value: viewAuthor.website ?? '—' },
                { label: 'Joined', value: format(new Date(viewAuthor.createdAt), 'PPP') },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewAuthor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
