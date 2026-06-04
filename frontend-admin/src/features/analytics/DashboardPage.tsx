import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, TrendingUp, ShoppingCart,
  Clock, CheckCircle, XCircle, Star,
  ArrowRight, Zap, RefreshCw, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  fetchDashboardStats, fetchRecentPurchases,
  fetchTopBooks, fetchPendingBooks, fetchTopAuthors,
  type DashboardStats,
} from '../../services/analytics.service';
import { updateBookStatus } from '../../services/books.service';
import { useAdminContext } from '../../components/layout/AdminLayout';

// ── Stat Card ───────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, dim, delay = 0, loading,
}: {
  label: string; value: string | number; sub: string;
  icon: React.ElementType; color: string; dim: string; delay?: number; loading?: boolean;
}) {
  return (
    <div className="stat-card animate-fade-in-up" style={{ animationDelay: `${delay}s` }}>
      <div className="stat-card-icon" style={{ background: dim }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">
          {loading ? <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Loading…</span> : value}
        </div>
        <div className="stat-card-sub" dangerouslySetInnerHTML={{ __html: sub }} />
      </div>
      <div className="stat-card-glow" style={{ background: color }} />
    </div>
  );
}



function LoadingPulse({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: 44, marginBottom: 10, borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)', animation: 'pulse 1.5s infinite',
        }} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { addToast } = useAdminContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [topBooks, setTopBooks] = useState<any[]>([]);
  const [pendingBooks, setPendingBooks] = useState<any[]>([]);
  const [topAuthors, setTopAuthors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, rp, tb, pb, ta] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentPurchases(5),
        fetchTopBooks(5),
        fetchPendingBooks(5),
        fetchTopAuthors(4),
      ]);
      setStats(s);
      setRecentPurchases(rp);
      setTopBooks(tb);
      setPendingBooks(pb);
      setTopAuthors(ta);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleApprove(bookId: string) {
    setApprovingId(bookId);
    try {
      await updateBookStatus(bookId, 'PUBLISHED');
      addToast('Book approved and published!', 'success');
      await loadAll();
    } catch {
      addToast('Failed to approve book.', 'error');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(bookId: string) {
    setApprovingId(bookId);
    try {
      await updateBookStatus(bookId, 'REJECTED');
      addToast('Book rejected.', 'error');
      await loadAll();
    } catch {
      addToast('Failed to reject book.', 'error');
    } finally {
      setApprovingId(null);
    }
  }

  const avatarColors = ['gold', 'blue', 'green', 'purple', 'red'];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Dashboard</h1>
            <p>Platform overview — real-time data from Supabase.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(stats?.pendingBooks ?? 0) > 0 && (
              <Link to="/books?tab=SUBMITTED" className="btn btn-primary" id="review-pending-btn">
                <Clock size={15} />
                {stats?.pendingBooks} Pending Review
              </Link>
            )}
            <button className="btn btn-secondary btn-sm" onClick={loadAll} id="refresh-dashboard-btn">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={loadAll}>Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          label="Total Books" loading={loading}
          value={stats ? `${stats.publishedBooks} / ${stats.totalBooks}` : '—'}
          sub={`<span class="up">↑ ${stats?.publishedBooks ?? 0} published</span> · ${stats?.pendingBooks ?? 0} pending`}
          icon={BookOpen} color="var(--color-gold)" dim="var(--color-gold-dim)" delay={0.05}
        />
        <StatCard
          label="Total Users" loading={loading}
          value={stats?.totalUsers ?? '—'}
          sub={`<span class="up">↑ ${stats?.totalAuthors ?? 0} authors</span> · ${stats?.totalUsers ?? 0} total`}
          icon={Users} color="var(--color-blue)" dim="var(--color-blue-dim)" delay={0.1}
        />
        <StatCard
          label="Total Revenue" loading={loading}
          value={stats ? `₹${(stats.totalRevenue / 1000).toFixed(1)}K` : '—'}
          sub={`<span class="up">↑ ${stats?.totalPurchases ?? 0} purchases</span>`}
          icon={TrendingUp} color="var(--color-green)" dim="var(--color-green-dim)" delay={0.15}
        />
        <StatCard
          label="Pending Actions" loading={loading}
          value={(stats?.pendingBooks ?? 0) + (stats?.pendingApplications ?? 0)}
          sub={`${stats?.pendingBooks ?? 0} books · ${stats?.pendingApplications ?? 0} applications`}
          icon={ShoppingCart} color="var(--color-purple)" dim="var(--color-purple-dim)" delay={0.2}
        />
      </div>

      {/* Quick action banners */}
      {!loading && (stats?.pendingBooks ?? 0) > 0 && (
        <div className="announcement-banner animate-fade-in-up stagger-3" style={{ marginBottom: 'var(--space-md)' }}>
          <Zap size={16} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            <strong style={{ color: 'var(--color-gold)' }}>{stats?.pendingBooks} books</strong> are waiting for your review —&nbsp;
          </span>
          <Link to="/books?tab=PENDING_REVIEW" style={{ color: 'var(--color-gold)', fontWeight: 600, textDecoration: 'underline' }}>
            Review now →
          </Link>
        </div>
      )}
      {!loading && (stats?.pendingApplications ?? 0) > 0 && (
        <div className="announcement-banner animate-fade-in-up stagger-3" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-blue)30', background: 'rgba(79,142,247,0.06)' }}>
          <Clock size={16} style={{ color: 'var(--color-blue)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            <strong style={{ color: 'var(--color-blue)' }}>{stats?.pendingApplications} author application{(stats?.pendingApplications ?? 0) > 1 ? 's' : ''}</strong> pending —&nbsp;
          </span>
          <Link to="/applications" style={{ color: 'var(--color-blue)', fontWeight: 600, textDecoration: 'underline' }}>
            Review now →
          </Link>
        </div>
      )}

      {/* Two-column: Pending Review + Recent Purchases */}
      <div className="content-grid-3 animate-fade-in-up stagger-4" style={{ marginBottom: 'var(--space-md)' }}>
        {/* Pending Books */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Pending Review</span>
            <Link to="/books?tab=PENDING_REVIEW" style={{ fontSize: '0.78rem', color: 'var(--color-gold)' }}>See all</Link>
          </div>
          <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
            {loading ? <LoadingPulse rows={3} /> : pendingBooks.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                <CheckCircle size={32} />
                <p>All caught up!</p>
              </div>
            ) : (
              pendingBooks.map(book => (
                <div key={book.id} style={{
                  display: 'flex', gap: 10, padding: '10px 0',
                  borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
                }}>
                  <div style={{
                    width: 32, height: 44, borderRadius: '3px 5px 5px 3px', flexShrink: 0,
                    background: book.coverColor || 'linear-gradient(135deg,#C17817,#8B4513)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '2px 2px 6px rgba(0,0,0,0.35)',
                  }}>
                    <span style={{ color: '#fff', fontSize: '0.5rem', fontWeight: 800 }}>{book.title.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{book.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{book.author}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      disabled={approvingId === book.id}
                      style={{ width: 28, height: 28, background: 'var(--color-green-dim)', border: 'none', color: 'var(--color-green)' }}
                      id={`approve-${book.id}`}
                      onClick={() => handleApprove(book.id)}
                    >
                      <CheckCircle size={13} />
                    </button>
                    <button
                      className="btn-icon"
                      disabled={approvingId === book.id}
                      style={{ width: 28, height: 28, background: 'var(--color-red-dim)', border: 'none', color: 'var(--color-red)' }}
                      id={`reject-${book.id}`}
                      onClick={() => handleReject(book.id)}
                    >
                      <XCircle size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Purchases */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Recent Purchases</span>
            <Link to="/orders" style={{ fontSize: '0.78rem', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ padding: '0 var(--space-md)' }}>
            {loading ? <LoadingPulse rows={4} /> : recentPurchases.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0',
                borderBottom: i < recentPurchases.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div className={`avatar avatar-sm avatar-${avatarColors[i % avatarColors.length]}`}>
                  {(p.userName ?? '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{p.userName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} className="truncate">{p.bookTitle}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                    {p.isFree ? 'FREE' : `₹${p.amount}`}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {p.purchasedAt ? format(new Date(p.purchasedAt), 'MMM d') : '—'}
                  </div>
                </div>
                <span className={`badge ${p.isFree ? 'badge-approved' : 'badge-pending'}`}>
                  {p.isFree ? 'free' : 'paid'}
                </span>
              </div>
            ))}
            {!loading && recentPurchases.length === 0 && (
              <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                <ShoppingCart size={32} />
                <p>No purchases yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Books + Top Authors + Platform Overview */}
      <div className="content-grid animate-fade-in-up stagger-5">
        {/* Top Performing Books */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Top Performing Books</span>
            <Link to="/books" style={{ fontSize: '0.78rem', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            {loading ? <LoadingPulse rows={5} /> : (
              <table>
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Rating</th>
                    <th style={{ textAlign: 'right' }}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {topBooks.map(book => (
                    <tr key={book.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 44, borderRadius: '3px 5px 5px 3px',
                            background: book.coverColor || '#C17817', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
                          }}>
                            <span style={{ color: '#fff', fontSize: '0.5rem', fontWeight: 800 }}>{book.title.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{book.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{book.author}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{book.category}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)' }}>₹{book.price}</td>
                      <td>
                        {book.averageRating > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-gold)', fontSize: '0.82rem' }}>
                            <Star size={11} fill="currentColor" /> {book.averageRating.toFixed(1)}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {book.purchaseCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && topBooks.length === 0 && (
              <div className="empty-state"><BookOpen size={32} /><p>No published books yet</p></div>
            )}
          </div>
        </div>

        {/* Top Authors */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Top Authors</span>
            <Link to="/authors" style={{ fontSize: '0.78rem', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ padding: '0 var(--space-md)' }}>
            {loading ? <LoadingPulse rows={4} /> : topAuthors.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0',
                borderBottom: i < topAuthors.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div className={`avatar avatar-sm avatar-${avatarColors[i % avatarColors.length]}`}>
                  {(a.name ?? '?')[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{a.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.totalBooks} books · {a.totalSales} sales</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  {a.totalSales} sales
                </div>
              </div>
            ))}
            {!loading && topAuthors.length === 0 && (
              <div className="empty-state"><Users size={32} /><p>No authors yet</p></div>
            )}
          </div>
        </div>

        {/* Platform Overview */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Platform Overview</span>
            {!loading && <span className="badge badge-approved">Live data</span>}
          </div>
          <div className="section-card-body">
            {loading ? <LoadingPulse rows={5} /> : stats && [
              { label: 'Total Books', value: stats.totalBooks, max: Math.max(stats.totalBooks, 1), color: 'var(--color-gold)' },
              { label: 'Published', value: stats.publishedBooks, max: Math.max(stats.totalBooks, 1), color: 'var(--color-green)' },
              { label: 'Pending Review', value: stats.pendingBooks, max: Math.max(stats.totalBooks, 1), color: 'var(--color-gold)' },
              { label: 'Total Authors', value: stats.totalAuthors, max: Math.max(stats.totalUsers, 1), color: 'var(--color-purple)' },
              { label: 'Total Purchases', value: stats.totalPurchases, max: Math.max(stats.totalPurchases, 1), color: 'var(--color-green)' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(item.value / item.max) * 100}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
