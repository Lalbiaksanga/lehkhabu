import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Star, MoreVertical, Trash2, Eye, XCircle, RefreshCw, AlertCircle, CheckCircle, Clock, MessageSquare } from 'lucide-react';
import {
  fetchBooks, deleteBook, approveBook, rejectBook, requestChanges, markUnderReview,
  type AdminBook, type AdminBookStatus,
} from '../../services/books.service';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format } from 'date-fns';

type StatusFilter = 'all' | AdminBookStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'SUBMITTED', label: 'Review Queue' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'NEEDS_CHANGES', label: 'Needs Changes' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'DRAFT', label: 'Drafts' },
];

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: 'approved',
  SUBMITTED: 'pending',
  UNDER_REVIEW: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'archived',
  DRAFT: 'draft',
};

const COVER_COLORS = [
  'linear-gradient(135deg,#C17817,#8B4513)',
  'linear-gradient(135deg,#4F8EF7,#1E40AF)',
  'linear-gradient(135deg,#34D399,#065F46)',
  'linear-gradient(135deg,#A78BFA,#5B21B6)',
];

export default function BooksPage() {
  const { addToast, adminRole } = useAdminContext();
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusFilter>('SUBMITTED');
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewBook, setViewBook] = useState<AdminBook | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // Decision modal for reject / needs-changes
  const [decisionModal, setDecisionModal] = useState<{ book: AdminBook; action: 'REJECTED' | 'NEEDS_CHANGES' } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decidingError, setDecidingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setBooks(await fetchBooks()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load books'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => setOpenMenuId(null);
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  const filtered = books
    .filter(b => activeTab === 'all' || b.status === activeTab)
    .filter(b =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase())
    );

  const tabCounts = STATUS_TABS.map(t => ({
    ...t,
    count: t.key === 'all' ? books.length : books.filter(b => b.status === t.key).length,
  }));

  async function handleAction(bookId: string, action: () => Promise<void>, label: string) {
    setMutatingId(bookId);
    try {
      await action();
      addToast(label, 'success');
      await load();
      if (viewBook?.id === bookId) setViewBook(null);
    } catch {
      addToast('Action failed.', 'error');
    } finally { setMutatingId(null); setOpenMenuId(null); }
  }

  async function handleDecision() {
    if (!decisionModal) return;
    if (!decisionNotes.trim()) { setDecidingError('Please provide a reason/feedback.'); return; }
    const { book, action } = decisionModal;
    setMutatingId(book.id);
    try {
      if (action === 'REJECTED') await rejectBook(book.id, decisionNotes);
      else await requestChanges(book.id, decisionNotes);
      addToast(action === 'REJECTED' ? 'Book rejected. Author notified.' : 'Changes requested. Author notified.', 'error');
      await load();
      setDecisionModal(null); setDecisionNotes(''); setDecidingError(null);
      if (viewBook?.id === book.id) setViewBook(null);
    } catch {
      addToast('Action failed.', 'error');
    } finally { setMutatingId(null); }
  }

  async function handleDelete(bookId: string) {
    if (!confirm('Delete this book permanently?')) return;
    setMutatingId(bookId);
    try { await deleteBook(bookId); addToast('Book deleted.', 'error'); await load(); }
    catch { addToast('Failed to delete.', 'error'); }
    finally { setMutatingId(null); setOpenMenuId(null); }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Books</h1>
            <p>Moderate submitted books and manage the full publishing pipeline.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-books-btn">
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
        <div className="filter-tabs" style={{ flexWrap: 'wrap' }}>
          {tabCounts.map(t => (
            <button
              key={t.key}
              className={`filter-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
              id={`tab-${t.key}`}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  marginLeft: 4, fontSize: '0.68rem', fontWeight: 700,
                  background: activeTab === t.key ? 'var(--color-gold-dim)' : 'var(--bg-elevated)',
                  color: activeTab === t.key ? 'var(--color-gold)' : 'var(--text-muted)',
                  borderRadius: 'var(--radius-full)', padding: '1px 6px'
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <Search />
          <input className="search-input" placeholder="Search books, authors…" value={search} onChange={e => setSearch(e.target.value)} id="books-search" />
        </div>
      </div>

      {/* Table */}
      <div className="section-card animate-fade-in">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading books…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><Filter size={40} /><p>No books in this queue.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Book</th><th>Status</th><th>Price</th>
                  <th>Rating</th><th>Sales</th><th>Submitted</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((book, idx) => (
                  <tr key={book.id} style={{ opacity: mutatingId === book.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                        <div style={{ width: 34, height: 48, borderRadius: '3px 6px 6px 3px', background: book.coverColorPrimary ?? COVER_COLORS[idx % COVER_COLORS.length], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 6px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                          {book.coverImageUrl ? <img src={book.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: '0.52rem', fontWeight: 800 }}>{book.title.slice(0, 2).toUpperCase()}</span>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }} className="truncate">{book.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{book.author}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{book.language} · {book.category}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${STATUS_BADGE[book.status] ?? 'pending'}`}>
                        {book.status.replace(/_/g, ' ')}
                      </span>
                      {book.status === 'NEEDS_CHANGES' && book.adminNotes && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3, maxWidth: 160 }} className="truncate" title={book.adminNotes}>
                          📝 {book.adminNotes}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: book.isFree ? 'var(--color-green)' : 'var(--color-gold)', fontWeight: 600 }}>
                      {book.isFree ? 'FREE' : `₹${book.price}`}
                    </td>
                    <td>
                      {book.averageRating > 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-gold)', fontWeight: 600, fontSize: '0.82rem' }}>
                          <Star size={12} fill="currentColor" /> {book.averageRating.toFixed(1)}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{book.purchaseCount}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {book.submittedAt ? format(new Date(book.submittedAt), 'MMM d, yyyy') : '—'}
                    </td>
                    <td>
                      <div className="dropdown" style={{ position: 'relative' }}>
                        <button className="btn-icon" onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === book.id ? null : book.id); }} id={`book-menu-${book.id}`}>
                          <MoreVertical size={15} />
                        </button>
                        {openMenuId === book.id && (
                          <div className="dropdown-menu" onClick={e => e.stopPropagation()}>
                            <div className="dropdown-item" onClick={() => { setViewBook(book); setOpenMenuId(null); }}><Eye size={14} /> View Details</div>
                            {adminRole !== 'readonly_admin' && book.status === 'SUBMITTED' && (
                              <>
                                <div className="dropdown-divider" />
                                <div className="dropdown-item" onClick={() => handleAction(book.id, () => markUnderReview(book.id), 'Now under review.')} style={{ color: 'var(--color-gold)' }}>
                                  <Clock size={14} /> Start Review
                                </div>
                              </>
                            )}
                            {adminRole !== 'readonly_admin' && ['SUBMITTED', 'UNDER_REVIEW'].includes(book.status) && (
                              <>
                                <div className="dropdown-divider" />
                                <div className="dropdown-item" onClick={() => handleAction(book.id, () => approveBook(book.id), 'Book approved & published!')} style={{ color: 'var(--color-green)' }}>
                                  <CheckCircle size={14} /> Approve & Publish
                                </div>
                                <div className="dropdown-item danger" onClick={() => { setDecisionModal({ book, action: 'REJECTED' }); setOpenMenuId(null); }}>
                                  <XCircle size={14} /> Reject
                                </div>
                                <div className="dropdown-item" onClick={() => { setDecisionModal({ book, action: 'NEEDS_CHANGES' }); setOpenMenuId(null); }}>
                                  <MessageSquare size={14} /> Request Changes
                                </div>
                              </>
                            )}
                            {book.status === 'REJECTED' && (
                              <>
                                <div className="dropdown-divider" />
                                <div className="dropdown-item" onClick={() => handleAction(book.id, () => approveBook(book.id), 'Book approved & published!')} style={{ color: 'var(--color-green)' }}>
                                  <CheckCircle size={14} /> Re-approve & Publish
                                </div>
                              </>
                            )}
                            <div className="dropdown-divider" />
                            <div className="dropdown-item danger" onClick={() => handleDelete(book.id)}><Trash2 size={14} /> Delete</div>
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

      {/* Book Detail Modal */}
      {viewBook && (
        <div className="modal-backdrop" onClick={() => setViewBook(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>Book Details</h3>
              <button className="btn-icon" onClick={() => setViewBook(null)} id="close-book-modal"><XCircle size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
              <div style={{ width: 72, height: 100, borderRadius: '4px 8px 8px 4px', background: viewBook.coverColorPrimary ?? COVER_COLORS[0], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '4px 4px 16px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                {viewBook.coverImageUrl ? <img src={viewBook.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 800, textAlign: 'center', padding: 4 }}>{viewBook.title.slice(0, 4)}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: 4 }}>{viewBook.title}</h2>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>by {viewBook.author}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span className={`badge badge-${STATUS_BADGE[viewBook.status] ?? 'pending'}`}>{viewBook.status.replace(/_/g, ' ')}</span>
                  <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{viewBook.category}</span>
                  <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{viewBook.language}</span>
                </div>
                {viewBook.description && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{viewBook.description}</p>}
                {viewBook.adminNotes && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: '0.82rem', color: 'var(--color-red)' }}>
                    <strong>Admin notes:</strong> {viewBook.adminNotes}
                  </div>
                )}
                {viewBook.fileUrl && (
                  <a href={viewBook.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>
                    📄 Preview File
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
              {[
                { label: 'Price', value: viewBook.isFree ? 'FREE' : `₹${viewBook.price}` },
                { label: 'Pages', value: viewBook.totalPages ?? '—' },
                { label: 'Sales', value: viewBook.purchaseCount },
                { label: 'Rating', value: viewBook.averageRating > 0 ? `${viewBook.averageRating.toFixed(1)} ★` : 'None' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              {['SUBMITTED', 'UNDER_REVIEW'].includes(viewBook.status) && (
                <>
                  {viewBook.status === 'SUBMITTED' && (
                    <button className="btn btn-secondary" disabled={mutatingId === viewBook.id} onClick={() => handleAction(viewBook.id, () => markUnderReview(viewBook.id), 'Now under review.')}>
                      <Clock size={14} /> Start Review
                    </button>
                  )}
                  <button className="btn btn-danger" disabled={mutatingId === viewBook.id} onClick={() => setDecisionModal({ book: viewBook, action: 'REJECTED' })}>Reject</button>
                  <button className="btn btn-secondary" disabled={mutatingId === viewBook.id} onClick={() => setDecisionModal({ book: viewBook, action: 'NEEDS_CHANGES' })}>Request Changes</button>
                  <button className="btn btn-primary" disabled={mutatingId === viewBook.id} onClick={() => handleAction(viewBook.id, () => approveBook(viewBook.id), 'Book approved & published!')}>Approve & Publish</button>
                </>
              )}
              {viewBook.status === 'REJECTED' && (
                <button className="btn btn-primary" disabled={mutatingId === viewBook.id} onClick={() => handleAction(viewBook.id, () => approveBook(viewBook.id), 'Book approved & published!')}>Re-approve</button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewBook(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal (Reject / Request Changes) */}
      {decisionModal && (
        <div className="modal-backdrop" onClick={() => { setDecisionModal(null); setDecisionNotes(''); setDecidingError(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>{decisionModal.action === 'REJECTED' ? '❌ Reject Book' : '📝 Request Changes'}</h3>
              <button className="btn-icon" onClick={() => { setDecisionModal(null); setDecisionNotes(''); setDecidingError(null); }}><XCircle size={16} /></button>
            </div>
            <div style={{ padding: '1rem var(--space-lg)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 12 }}>
                <strong>{decisionModal.book.title}</strong><br />
                {decisionModal.action === 'REJECTED'
                  ? 'Provide a reason for rejection. The author will be notified.'
                  : 'Describe the changes needed. The author will be notified and can resubmit.'}
              </p>
              <textarea
                id="decision-notes"
                className="form-control"
                rows={4}
                placeholder={decisionModal.action === 'REJECTED' ? 'e.g. Content does not meet our community guidelines…' : 'e.g. Please improve the cover image and add a proper description…'}
                value={decisionNotes}
                onChange={e => { setDecisionNotes(e.target.value); setDecidingError(null); }}
                style={{ width: '100%', resize: 'vertical' }}
              />
              {decidingError && <div style={{ color: 'var(--color-red)', fontSize: '0.82rem', marginTop: 6 }}>{decidingError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setDecisionModal(null); setDecisionNotes(''); setDecidingError(null); }}>Cancel</button>
              <button
                className={`btn ${decisionModal.action === 'REJECTED' ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleDecision}
                disabled={mutatingId === decisionModal.book.id}
                id="confirm-decision-btn"
              >
                {mutatingId === decisionModal.book.id ? 'Saving…' : decisionModal.action === 'REJECTED' ? 'Reject & Notify Author' : 'Send Feedback & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
