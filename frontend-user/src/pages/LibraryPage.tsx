import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useBooksStore } from '../store/booksStore';
import type { Book } from '../services/books.service';
import BookCover from '../components/common/BookCover';

type Tab = 'shelves' | 'wishlist';

export default function LibraryPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { shelf, shelfLoading, purchases, books, toggleWishlist, readingProgress } = useBooksStore();

  const [activeTab, setActiveTab] = useState<Tab>('shelves');

  // Purchased books (from purchases table)
  const purchasedBooks = books.filter((b) => purchases.includes(b.id) || b.is_free);

  // Wishlist from shelf entries
  const wishlistEntries = shelf.filter((s) => s.shelf === 'WANT_TO_READ');
  const wishlistBookIds = new Set(wishlistEntries.map((s) => s.book_id));
  const wishlistBooks = books.filter((b) => wishlistBookIds.has(b.id));

  // Group purchased books by category for shelves
  const shelves: Record<string, Book[]> = {};
  purchasedBooks.forEach((book) => {
    if (!shelves[book.category]) shelves[book.category] = [];
    shelves[book.category].push(book);
  });

  const handleRemoveWishlist = async (bookId: string) => {
    if (!profile?.id) return;
    await toggleWishlist(profile.id, bookId);
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="library-header">
        <div className="library-subtitle">My Favourite</div>
        <h1 className="library-title">BOOKS</h1>
      </div>

      {/* Tabs */}
      <div className="library-tabs">
        <button
          className={`library-tab ${activeTab === 'shelves' ? 'active' : ''}`}
          onClick={() => setActiveTab('shelves')}
        >
          📚 My Shelves
          <span className="tab-badge">{purchasedBooks.length}</span>
        </button>
        <button
          className={`library-tab ${activeTab === 'wishlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('wishlist')}
        >
          🔖 Wishlist
          <span className="tab-badge">{wishlistBooks.length}</span>
        </button>
      </div>

      {shelfLoading && (
        <div className="library-loading">
          <div className="auth-init-spinner" style={{ margin: '40px auto' }} />
        </div>
      )}

      {/* Shelves Tab */}
      {!shelfLoading && activeTab === 'shelves' && (
        <div className="animate-fade-in">
          {purchasedBooks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <h3>Your shelf is empty</h3>
              <p>Purchase books to add them to your library</p>
              <button
                className="btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => navigate('/explore')}
              >
                Browse Books
              </button>
            </div>
          ) : (
            Object.entries(shelves).map(([category, shelfBooks], idx) => (
              <ShelfRow
                key={category}
                category={category}
                books={shelfBooks}
                index={idx}
                onBookClick={(id) => navigate(`/book/${id}`)}
                readingProgress={readingProgress}
              />
            ))
          )}

          <button className="library-add-btn" onClick={() => navigate('/explore')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Browse More Books
          </button>
        </div>
      )}

      {/* Wishlist Tab */}
      {!shelfLoading && activeTab === 'wishlist' && (
        <div className="animate-fade-in">
          {wishlistBooks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔖</div>
              <h3>Your wishlist is empty</h3>
              <p>Tap the bookmark icon on any book to save it here</p>
              <button
                className="btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => navigate('/explore')}
              >
                Discover Books
              </button>
            </div>
          ) : (
            <div className="wishlist-grid">
              {wishlistBooks.map((book) => (
                <div key={book.id} className="wishlist-item" onClick={() => navigate(`/book/${book.id}`)}>
                  <BookCover book={book} className="wishlist-cover" />
                  <div className="wishlist-info">
                    <div className="wishlist-title">{book.title}</div>
                    <div className="wishlist-author">{book.author_name}</div>
                    <div className="wishlist-meta">
                      {book.average_rating > 0 && (
                        <span className="wishlist-rating">★ {book.average_rating.toFixed(1)}</span>
                      )}
                      <span className="wishlist-price">
                        {book.is_free ? 'Free' : `₹${book.price}`}
                      </span>
                    </div>
                    <div className="wishlist-actions">
                      <button
                        className="wishlist-buy-btn"
                        onClick={(e) => { e.stopPropagation(); navigate(`/book/${book.id}`); }}
                      >
                        {book.is_free ? 'Read Free' : 'Buy Now'}
                      </button>
                      <button
                        className="wishlist-remove-btn"
                        onClick={(e) => { e.stopPropagation(); handleRemoveWishlist(book.id); }}
                        aria-label="Remove from wishlist"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShelfRow({ category, books: shelfBooks, index, onBookClick, readingProgress }: {
  category: string;
  books: Book[];
  index: number;
  onBookClick: (id: string) => void;
  readingProgress: Record<string, { percentage: number; current_page: number; last_read_at: string }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' });

  return (
    <div className="shelf-section animate-fade-in-up" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="shelf-header">
        <h3 className="shelf-name">{category}</h3>
        <div className="shelf-count">
          {shelfBooks.length} book{shelfBooks.length !== 1 ? 's' : ''}
          <div className="shelf-arrows">
            <button className="shelf-arrow" onClick={() => scroll('left')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button className="shelf-arrow" onClick={() => scroll('right')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
          </div>
        </div>
      </div>
      <div className="shelf-scroll" ref={scrollRef}>
        {shelfBooks.map((book) => {
          const progress = readingProgress[book.id];
          const pct = progress?.percentage ?? 0;
          return (
            <div key={book.id} className="shelf-book" onClick={() => onBookClick(book.id)}>
              <div style={{ position: 'relative' }}>
                <BookCover book={book} className="shelf-book-cover" />
                {pct > 0 && (
                  <>
                    {/* Progress bar at bottom of cover */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: 4, background: 'rgba(0,0,0,0.3)',
                      borderRadius: '0 0 4px 4px', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: pct >= 100 ? '#4ade80' : '#C17817',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    {/* Percentage badge */}
                    <span style={{
                      position: 'absolute', top: 4, right: 4,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                      color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                      fontFamily: 'var(--font-heading)',
                    }}>
                      {pct >= 100 ? '✓ Done' : `${pct}%`}
                    </span>
                  </>
                )}
              </div>
              <div className="shelf-book-title">{book.title}</div>
              {pct > 0 && pct < 100 && (
                <div style={{
                  fontSize: '0.62rem', color: 'var(--color-terracotta)',
                  fontWeight: 600, marginTop: 2,
                  fontFamily: 'var(--font-heading)',
                }}>
                  Continue Reading
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
