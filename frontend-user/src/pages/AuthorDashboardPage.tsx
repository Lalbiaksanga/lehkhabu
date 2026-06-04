import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  fetchAuthorDashboard,
  createBook,
  updateBook,
  deleteBook,
  uploadBookCover,
  uploadBookFile,
  submitBookForReview,
  resubmitBook,
  type AuthorBook,
  type AuthorAnalytics,
} from '../services/author.service';

const GENRES = [
  'Fiction', 'Non-Fiction', 'History', 'Religious', 'Poetry',
  'Novel', 'Short Stories', 'Spiritual', 'Travel', 'Biography', 'Academic', 'Children',
];
const LANGUAGES = ['Mizo', 'English', 'Hmar', 'Chakma', 'Hindi'];
const COVER_GRADIENTS = [
  { label: 'Amber', value: '#C17817', secondary: '#8B4513' },
  { label: 'Ocean', value: '#4F8EF7', secondary: '#1E40AF' },
  { label: 'Emerald', value: '#34D399', secondary: '#065F46' },
  { label: 'Violet', value: '#A78BFA', secondary: '#5B21B6' },
  { label: 'Sunset', value: '#FB923C', secondary: '#9A3412' },
  { label: 'Cyan', value: '#22D3EE', secondary: '#0E7490' },
  { label: 'Rose', value: '#F472B6', secondary: '#9D174D' },
];
const ACCEPTED_BOOK_FILES = '.pdf,.epub,.doc,.docx';
const ACCEPTED_COVER_FILES = '.jpg,.jpeg,.png,.webp';

type ModalMode = 'create' | 'edit';

interface BookFormState {
  title: string;
  description: string;
  language: string;
  category: string;
  tags: string;
  price: string;
  isFree: boolean;
  totalPages: string;
  coverColorPrimary: string;
  coverColorSecondary: string;
}

const emptyForm = (): BookFormState => ({
  title: '',
  description: '',
  language: '',
  category: '',
  tags: '',
  price: '99',
  isFree: false,
  totalPages: '',
  coverColorPrimary: COVER_GRADIENTS[0].value,
  coverColorSecondary: COVER_GRADIENTS[0].secondary,
});

function formatBookStatus(status: AuthorBook['status']) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT:         { label: '✏️ Draft',            cls: 'status-draft' },
    SUBMITTED:     { label: '📤 Submitted',        cls: 'status-pending' },
    UNDER_REVIEW:  { label: '🔍 Under Review',     cls: 'status-pending' },
    APPROVED:      { label: '✅ Approved',          cls: 'status-published' },
    PUBLISHED:     { label: '🚀 Published',         cls: 'status-published' },
    REJECTED:      { label: '❌ Rejected',          cls: 'status-rejected' },
    NEEDS_CHANGES: { label: '📝 Needs Changes',    cls: 'status-archived' },
  };
  return map[status] ?? { label: status, cls: '' };
}

export default function AuthorDashboardPage() {
  const { profile } = useAuthStore();

  const [authorProfile, setAuthorProfile] = useState<{ id: string } | null>(null);
  const [books, setBooks] = useState<AuthorBook[]>([]);
  const [analytics, setAnalytics] = useState<AuthorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Publish/Edit Modal
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState<AuthorBook | null>(null);
  const [form, setForm] = useState<BookFormState>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File uploads
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBook, setUploadingBook] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const bookFileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const userId = profile?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      // Single RPC call loads profile + books + analytics in one round trip
      const { authorProfile: ap, books: bks, analytics: an } = await fetchAuthorDashboard(userId);
      setAuthorProfile(ap as { id: string } | null);
      setBooks(bks);
      setAnalytics(an);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fallback client-side stats if analytics RPC hasn't run yet
  const publishedBooks = books.filter((b) => b.status === 'PUBLISHED');
  const totalViews = analytics?.totalViews ?? books.reduce((s, b) => s + (b.view_count ?? 0), 0);
  const totalPurchases = analytics?.totalPurchases ?? books.reduce((s, b) => s + b.purchase_count, 0);
  const avgRating = analytics?.avgRating ?? (publishedBooks.length > 0
    ? publishedBooks.filter((b) => b.average_rating > 0).reduce((s, b) => s + b.average_rating, 0)
      / (publishedBooks.filter((b) => b.average_rating > 0).length || 1)
    : 0);

  function openCreate() {
    setModalMode('create');
    setEditingBook(null);
    setForm(emptyForm());
    setCoverFile(null);
    setCoverPreview(null);
    setBookFile(null);
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  }

  function openEdit(book: AuthorBook) {
    setModalMode('edit');
    setEditingBook(book);
    setForm({
      title: book.title,
      description: book.description ?? '',
      language: book.language,
      category: book.category,
      tags: book.tags.join(', '),
      price: String(book.price),
      isFree: book.is_free,
      totalPages: book.total_pages ? String(book.total_pages) : '',
      coverColorPrimary: book.cover_color_primary ?? COVER_GRADIENTS[0].value,
      coverColorSecondary: book.cover_color_secondary ?? COVER_GRADIENTS[0].secondary,
    });
    setCoverFile(null);
    setCoverPreview(book.cover_image_url);
    setBookFile(null);
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormErrors((p) => ({ ...p, cover: 'Cover image must be under 5 MB' }));
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setFormErrors((p) => ({ ...p, cover: '' }));
  }

  function handleBookFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setFormErrors((p) => ({ ...p, bookFile: 'Book file must be under 50 MB' }));
      return;
    }
    setBookFile(file);
    setFormErrors((p) => ({ ...p, bookFile: '' }));
  }

  function validateForm(): boolean {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.language) e.language = 'Language is required';
    if (!form.category) e.category = 'Category is required';
    const price = parseFloat(form.price);
    if (!form.isFree && (isNaN(price) || price < 0)) e.price = 'Enter a valid price';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validateForm() || !authorProfile) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let coverImageUrl: string | undefined = editingBook?.cover_image_url ?? undefined;
      let fileUrl: string | undefined = editingBook?.file_url ?? undefined;

      // Upload cover if provided
      if (coverFile) {
        setUploadingCover(true);
        coverImageUrl = await uploadBookCover(authorProfile.id, coverFile);
        setUploadingCover(false);
      }

      // Upload book file if provided
      if (bookFile) {
        setUploadingBook(true);
        fileUrl = await uploadBookFile(authorProfile.id, bookFile);
        setUploadingBook(false);
      }

      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const totalPages = form.totalPages ? parseInt(form.totalPages) : undefined;
      const price = form.isFree ? 0 : parseFloat(form.price);

      if (modalMode === 'create') {
        const newBook = await createBook({
          authorProfileId: authorProfile.id,
          title: form.title,
          description: form.description,
          language: form.language,
          category: form.category,
          tags,
          price,
          isFree: form.isFree,
          totalPages,
          coverImageUrl,
          fileUrl,
          coverColorPrimary: form.coverColorPrimary,
          coverColorSecondary: form.coverColorSecondary,
        });
        setBooks((prev) => [newBook, ...prev]);
        setSuccessMsg('📄 Book saved as Draft. Submit it for review when ready!');
      } else if (editingBook) {
        const updated = await updateBook(editingBook.id, {
          title: form.title,
          description: form.description,
          language: form.language,
          category: form.category,
          tags,
          price,
          isFree: form.isFree,
          totalPages,
          coverImageUrl,
          fileUrl,
          coverColorPrimary: form.coverColorPrimary,
          coverColorSecondary: form.coverColorSecondary,
        });
        setBooks((prev) => prev.map((b) => b.id === updated.id ? updated : b));
        setSuccessMsg('✅ Book updated successfully!');
      }

      setShowModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadingCover(false);
      setUploadingBook(false);
    }
  }

  async function handleDelete(bookId: string) {
    setDeleting(true);
    try {
      await deleteBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      setDeleteConfirm(null);
      setSuccessMsg('Book deleted.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page author-dash-page">
        <div className="app-loading">
          <div className="app-loading-spinner" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page author-dash-page">
        <div className="app-error-banner">
          ⚠️ {error}
          <button className="btn-author-primary btn-sm" onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  if (!authorProfile) {
    return (
      <div className="page author-dash-page">
        <div className="app-status-card app-status-pending">
          <div className="app-status-icon">⏳</div>
          <h2>Author Profile Not Found</h2>
          <p>Your author profile hasn't been created yet. Please wait or contact support if you've been approved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page author-dash-page">
      {/* Header */}
      <div className="author-dash-header">
        <div className="author-dash-badge">✍️ Author</div>
        <h1 className="author-dash-title">Author Dashboard</h1>
        <p className="author-dash-sub">Publish, manage, and track your books on Lehkhabu.</p>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="author-publish-toast">{successMsg}</div>
      )}

      {/* Analytics Cards */}
      <div className="author-stats-grid">
        {[
          { label: 'Published',  value: publishedBooks.length, icon: '📚', color: 'var(--color-terracotta)' },
          { label: 'Total Books', value: books.length, icon: '🗂️', color: 'var(--color-sage-dark)' },
          { label: 'Total Views',  value: totalViews.toLocaleString('en-IN'), icon: '👁️', color: '#C17817' },
          { label: 'Purchases',  value: totalPurchases, icon: '🛒', color: '#7C3AED' },
          { label: 'Avg Rating', value: avgRating > 0 ? `${avgRating.toFixed(1)}★` : '—', icon: '⭐', color: '#D4AC0D' },
        ].map((s) => (
          <div key={s.label} className="author-stat-card">
            <div className="author-stat-icon">{s.icon}</div>
            <div className="author-stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="author-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Books Section */}
      <div className="author-section">
        <div className="author-section-header">
          <h2>Your Books</h2>
          <button className="btn-author-primary btn-sm" id="publish-new-btn" onClick={openCreate}>
            + Publish New Book
          </button>
        </div>

        {books.length === 0 ? (
          <div className="author-empty-state">
            <div className="author-empty-icon">📖</div>
            <h3>No books yet</h3>
            <p>Publish your first book and start reaching readers across the community.</p>
            <button className="btn-author-primary" onClick={openCreate}>
              Publish Your First Book
            </button>
          </div>
        ) : (
          <div className="author-books-list">
            {books.map((book) => {
              const { label, cls } = formatBookStatus(book.status);
              const coverGrad = book.cover_color_primary
                ? `linear-gradient(135deg, ${book.cover_color_primary}, ${book.cover_color_secondary ?? book.cover_color_primary})`
                : 'linear-gradient(135deg,#C17817,#8B4513)';

              return (
                <div key={book.id} className="author-book-row">
                  {/* Cover */}
                  <div
                    className="author-book-cover"
                    style={{
                      background: book.cover_image_url ? undefined : coverGrad,
                      backgroundImage: book.cover_image_url ? `url(${book.cover_image_url})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!book.cover_image_url && <span>{book.title.slice(0, 4)}</span>}
                  </div>

                  {/* Info */}
                  <div className="author-book-info">
                    <div className="author-book-title">{book.title}</div>
                    <div className="author-book-meta">
                      {book.category} · {book.language}
                      {book.total_pages ? ` · ${book.total_pages}p` : ''}
                      {' · '}
                      {book.is_free ? 'Free' : `₹${book.price}`}
                    </div>
                    <div className="author-book-published">
                      {book.published_at
                        ? `Published ${new Date(book.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : `Created ${new Date(book.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </div>
                    <span className={`author-book-status-badge ${cls}`}>{label}</span>
                  </div>

                  {/* Stats */}
                  <div className="author-book-stats">
                    <div className="author-book-stat">
                      <span className="author-book-stat-val">{book.view_count ?? 0}</span>
                      <span className="author-book-stat-label">Views</span>
                    </div>
                    <div className="author-book-stat">
                      <span className="author-book-stat-val">{book.purchase_count}</span>
                      <span className="author-book-stat-label">Purchases</span>
                    </div>
                    <div className="author-book-stat">
                      <span className="author-book-stat-val">
                        {book.average_rating > 0 ? `${book.average_rating.toFixed(1)}★` : '—'}
                      </span>
                      <span className="author-book-stat-label">Rating</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="author-book-actions">
                    {/* Admin feedback for NEEDS_CHANGES */}
                    {book.status === 'NEEDS_CHANGES' && book.admin_notes && (
                      <div className="author-book-feedback">
                        <strong>Feedback:</strong> {book.admin_notes}
                      </div>
                    )}
                    {(book.status === 'DRAFT' || book.status === 'NEEDS_CHANGES') && (
                      <button
                        className="author-book-action-btn"
                        title="Submit for Review"
                        onClick={async () => {
                          try {
                            const updated = book.status === 'NEEDS_CHANGES'
                              ? await resubmitBook(book.id)
                              : await submitBookForReview(book.id);
                            setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
                            setSuccessMsg('📤 Book submitted for review!');
                            setTimeout(() => setSuccessMsg(null), 3000);
                          } catch (e) {
                            setSubmitError(e instanceof Error ? e.message : 'Submit failed');
                          }
                        }}
                        style={{ fontSize: '0.78rem', padding: '0 12px', width: 'auto', fontWeight: 600, color: 'var(--color-blue)', borderColor: 'var(--color-blue-dim)', background: 'rgba(79,142,247,0.06)' }}
                      >
                        Submit
                      </button>
                    )}
                    <button
                      className="author-book-action-btn"
                      title="Edit"
                      onClick={() => openEdit(book)}
                      disabled={!['DRAFT', 'NEEDS_CHANGES', 'REJECTED'].includes(book.status)}
                    >
                      ✏️
                    </button>
                    <button
                      className="author-book-action-btn author-book-action-delete"
                      title="Delete"
                      onClick={() => setDeleteConfirm(book.id)}
                      disabled={!['DRAFT', 'REJECTED'].includes(book.status)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Publish / Edit Modal */}
      {showModal && (
        <div className="author-modal-backdrop" onClick={() => !submitting && setShowModal(false)}>
          <div className="author-modal author-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="author-modal-header">
              <h3>{modalMode === 'create' ? 'Publish New Book' : 'Edit Book'}</h3>
              <button className="author-modal-close" onClick={() => !submitting && setShowModal(false)}>✕</button>
            </div>

            <div className="author-modal-body">
              {/* Cover Image */}
              <div className="app-field">
                <label>Book Cover</label>
                <div className="author-cover-upload-row">
                  <div
                    className="author-cover-preview"
                    style={{
                      background: coverPreview ? undefined : `linear-gradient(135deg, ${form.coverColorPrimary}, ${form.coverColorSecondary})`,
                      backgroundImage: coverPreview ? `url(${coverPreview})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {!coverPreview && <span className="author-cover-placeholder">📷<br/><small>Upload Cover</small></span>}
                  </div>
                  <div className="author-cover-controls">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept={ACCEPTED_COVER_FILES}
                      style={{ display: 'none' }}
                      onChange={handleCoverChange}
                    />
                    <button
                      className="author-cover-upload-btn"
                      onClick={() => coverInputRef.current?.click()}
                      type="button"
                    >
                      {coverFile ? `📄 ${coverFile.name.slice(0, 24)}` : '📁 Choose Image'}
                    </button>
                    {coverPreview && !coverFile && <span className="author-cover-hint">Current cover loaded</span>}
                    {formErrors.cover && <span className="app-field-error">{formErrors.cover}</span>}

                    <div className="app-cover-colors">
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Or pick a color</label>
                      <div className="author-color-swatches">
                        {COVER_GRADIENTS.map((g) => (
                          <button
                            key={g.label}
                            type="button"
                            className={`app-color-swatch ${form.coverColorPrimary === g.value ? 'selected' : ''}`}
                            style={{ background: `linear-gradient(135deg,${g.value},${g.secondary})` }}
                            title={g.label}
                            onClick={() => {
                              setForm((f) => ({ ...f, coverColorPrimary: g.value, coverColorSecondary: g.secondary }));
                              setCoverPreview(null);
                              setCoverFile(null);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Book File */}
              <div className="app-field">
                <label>Book File <span className="app-field-hint">(PDF, EPUB, DOCX)</span></label>
                <div className="author-file-upload-row">
                  <input
                    ref={bookFileInputRef}
                    type="file"
                    accept={ACCEPTED_BOOK_FILES}
                    style={{ display: 'none' }}
                    onChange={handleBookFileChange}
                  />
                  <button
                    type="button"
                    className="author-cover-upload-btn"
                    onClick={() => bookFileInputRef.current?.click()}
                  >
                    {bookFile ? `📄 ${bookFile.name.slice(0, 30)}` : editingBook?.file_url ? '📄 Replace file' : '📁 Upload Book File'}
                  </button>
                  {editingBook?.file_url && !bookFile && (
                    <span className="author-cover-hint">✓ File already uploaded</span>
                  )}
                  {formErrors.bookFile && <span className="app-field-error">{formErrors.bookFile}</span>}
                </div>
              </div>

              {/* Title */}
              <div className="app-field">
                <label>Book Title *</label>
                <input
                  id="publish-title"
                  className={`app-input ${formErrors.title ? 'app-input-error' : ''}`}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Kalpana"
                />
                {formErrors.title && <span className="app-field-error">{formErrors.title}</span>}
              </div>

              {/* Description */}
              <div className="app-field">
                <label>Description *</label>
                <textarea
                  id="publish-desc"
                  className={`app-textarea ${formErrors.description ? 'app-input-error' : ''}`}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief synopsis of your book…"
                  rows={3}
                />
                {formErrors.description && <span className="app-field-error">{formErrors.description}</span>}
              </div>

              {/* Category */}
              <div className="app-field">
                <label>Category *</label>
                <div className="app-radio-group">
                  {GENRES.map((g) => (
                    <div
                      key={g}
                      className={`app-radio-pill ${form.category === g ? 'selected' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, category: g }))}
                    >
                      {g}
                    </div>
                  ))}
                </div>
                {formErrors.category && <span className="app-field-error" style={{ marginTop: 8, display: 'block' }}>{formErrors.category}</span>}
              </div>

              {/* Language */}
              <div className="app-field">
                <label>Language *</label>
                <div className="app-radio-group">
                  {LANGUAGES.map((l) => (
                    <div
                      key={l}
                      className={`app-radio-pill ${form.language === l ? 'selected' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, language: l }))}
                    >
                      {l}
                    </div>
                  ))}
                </div>
                {formErrors.language && <span className="app-field-error" style={{ marginTop: 8, display: 'block' }}>{formErrors.language}</span>}
              </div>

              {/* Tags */}
              <div className="app-field">
                <label>Tags <span className="app-field-hint">(comma-separated, optional)</span></label>
                <input
                  className="app-input"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g. adventure, romance, coming-of-age"
                />
              </div>

              {/* Price & Pages */}
              <div className="app-fields-row">
                <div className="app-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.isFree}
                      onChange={(e) => setForm((f) => ({ ...f, isFree: e.target.checked }))}
                      style={{ marginRight: 6 }}
                    />
                    Free book
                  </label>
                  {!form.isFree && (
                    <input
                      type="number"
                      className={`app-input ${formErrors.price ? 'app-input-error' : ''}`}
                      value={form.price}
                      min={0}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="Price in ₹"
                    />
                  )}
                  {formErrors.price && <span className="app-field-error">{formErrors.price}</span>}
                </div>
                <div className="app-field">
                  <label>Total Pages <span className="app-field-hint">(optional)</span></label>
                  <input
                    type="number"
                    className="app-input"
                    value={form.totalPages}
                    min={1}
                    onChange={(e) => setForm((f) => ({ ...f, totalPages: e.target.value }))}
                    placeholder="e.g. 320"
                  />
                </div>
              </div>

              {submitError && (
                <div className="app-submit-error">⚠️ {submitError}</div>
              )}
            </div>

            <div className="author-modal-footer">
              <button className="app-back-btn" onClick={() => !submitting && setShowModal(false)} disabled={submitting}>
                Cancel
              </button>
              <button
                className="btn-author-primary"
                id="publish-submit-btn"
                onClick={handleSave}
                disabled={submitting}
              >
                {submitting
                  ? uploadingCover ? 'Uploading cover…'
                    : uploadingBook ? 'Uploading file…'
                    : 'Saving…'
                  : modalMode === 'create' ? '💾 Save as Draft' : '✅ Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="author-modal-backdrop" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="author-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="author-modal-header">
              <h3>Delete Book?</h3>
            </div>
            <div style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)' }}>
              This action cannot be undone. The book and all its data will be permanently removed.
            </div>
            <div className="author-modal-footer">
              <button className="app-back-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn-author-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : '🗑️ Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
