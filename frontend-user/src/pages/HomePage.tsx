import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useBooksStore } from '../store/booksStore';
import type { Book, ShelfEntry } from '../services/books.service';
import BookCover from '../components/common/BookCover';
import { usePageMeta } from '../hooks/usePageMeta';

/* ── Tiny reusable heart button ─────────────────────────── */
function HeartBtn({
  bookId,
  userId,
}: {
  bookId: string;
  userId: string | undefined;
}) {
  const { isInWishlist, toggleWishlist } = useBooksStore();
  const [loading, setLoading] = useState(false);
  const active = isInWishlist(bookId);

  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || loading) return;
    setLoading(true);
    try { await toggleWishlist(userId, bookId); }
    finally { setLoading(false); }
  };

  return (
    <button
      className={`hb-heart${active ? ' hb-heart--active' : ''}`}
      onClick={handle}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
      disabled={loading}
    >
      <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}

/* ── 3-D Grid Book Card ─────────────────────────────────── */
function GridBookCard({ book, userId }: { book: Book; userId: string | undefined }) {
  const navigate = useNavigate();
  return (
    <div className="hb-book-card" onClick={() => navigate(`/book/${book.id}`)}>
      <div className="hb-book-card-top">
        <span className="hb-read-now">READ NOW</span>
        <HeartBtn bookId={book.id} userId={userId} />
      </div>
      <div className="hb-book-3d-wrap">
        <BookCover book={book} className="hb-book-3d-cover" />
      </div>
      <div className="hb-book-info">
        {book.average_rating > 0 && (
          <div className="hb-book-rating">
            <svg viewBox="0 0 24 24" fill="#F5A623" width="11" height="11">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {book.average_rating.toFixed(1)}
          </div>
        )}
        <div className="hb-book-title">{book.title}</div>
        <div className="hb-book-author">by {book.author_name}</div>
      </div>
    </div>
  );
}

/* ── Horizontal scroll book strip ───────────────────────── */
function BookStrip({ books, userId, autoScrollDelay = 0 }: { books: Book[]; userId: string | undefined; autoScrollDelay?: number }) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (!isDown && scrollRef.current) {
          scrollRef.current.scrollBy({ left: 180, behavior: 'smooth' });
        }
      }, 8000);
      return () => clearInterval(interval);
    }, autoScrollDelay);
    
    return () => clearTimeout(timeout);
  }, [isDown, autoScrollDelay]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDown(true);
    setIsDragging(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  
  const onMouseLeave = () => {
    setIsDown(false);
    setIsDragging(false);
  };
  
  const onMouseUp = () => {
    setIsDown(false);
    setTimeout(() => setIsDragging(false), 50);
  };
  
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDown || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const multiplier = window.innerWidth > 768 ? 3.5 : 2;
    const walk = (x - startX) * multiplier; 
    if (Math.abs(walk) > 5) {
      setIsDragging(true);
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleCardClick = (e: React.MouseEvent, bookId: string) => {
    if (isDragging) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    navigate(`/book/${bookId}`);
  };

  // Only loop books if there are enough to warrant it — cap at 3 copies max
  const displayBooks = books.length > 0
    ? (books.length < 6 ? [...books, ...books, ...books] : books)
    : books;

  return (
    <div 
      className="hb-strip"
      ref={scrollRef}
      onMouseDown={onMouseDown}
      onMouseLeave={onMouseLeave}
      onMouseUp={onMouseUp}
      onMouseMove={onMouseMove}
      style={{ 
        cursor: isDown ? 'grabbing' : 'grab',
        scrollBehavior: isDown ? 'auto' : 'smooth' 
      }}
    >
      {displayBooks.map((book, idx) => (
        <div key={`${book.id}-${idx}`} className="hb-strip-card" onClick={(e) => handleCardClick(e, book.id)}>
          <div className="hb-strip-cover-wrap">
            <BookCover book={book} className="hb-strip-cover" />
            <div className="hb-strip-heart-wrap">
              <HeartBtn bookId={book.id} userId={userId} />
            </div>
          </div>
          <div className="hb-strip-title">{book.title}</div>
          <div className="hb-strip-author">{book.author_name}</div>
          {book.average_rating > 0 && (
            <div className="hb-book-rating" style={{ marginTop: 2 }}>
              <svg viewBox="0 0 24 24" fill="#F5A623" width="10" height="10">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {book.average_rating.toFixed(1)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Continue Reading card ──────────────────────────────── */
function ContinueReadingCard({ entry, book }: { entry: ShelfEntry; book: Book }) {
  const navigate = useNavigate();
  const { readingProgress } = useBooksStore();
  const rp = readingProgress[entry.book_id];
  const totalPages = book.total_pages ?? 1;
  const currentPage = rp?.current_page ?? 0;
  const progress = totalPages > 0 ? Math.min(Math.round((currentPage / totalPages) * 100), 100) : 0;

  return (
    <div
      className="hb-cr-row"
      onClick={() => navigate(`/read/${entry.book_id}`)}
    >
      <div className="hb-cr-cover-wrap">
        <BookCover book={book} className="hb-cr-cover" />
      </div>
      <div className="hb-cr-info">
        <span className="hb-read-now" style={{ marginBottom: 3 }}>CONTINUE READING</span>
        <div className="hb-cr-title">{book.title}</div>
        <div className="hb-cr-sub">by {book.author_name}</div>
        <div className="hb-cr-bar">
          <div className="hb-cr-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="hb-cr-progress-label">
          {rp ? `Page ${currentPage} of ${totalPages} · ${progress}% completed` : 'Start reading'}
        </div>
      </div>
      <div className="hb-cr-chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}

/* ── Section Header ─────────────────────────────────── */
function SectionHeader({
  title,
  sectionKey,
  isExpanded,
  onToggle,
}: {
  title: string;
  sectionKey?: string;
  isExpanded?: boolean;
  onToggle?: (key: string) => void;
}) {
  return (
    <div className="hb-section-header">
      <span>{title}</span>
      {sectionKey && onToggle && (
        <button onClick={() => onToggle(sectionKey)}>
          {isExpanded ? 'Collapse' : 'View more'}
        </button>
      )}
    </div>
  );
}

/* ── Main HomePage ──────────────────────────────────────── */
export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { books, booksLoading, loadBooks, shelf } = useBooksStore();

  const userId = profile?.id;
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.username ?? 'Reader';

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  usePageMeta({
    title: 'Lehkhabu — Read, Discover, Collect',
    description: 'Discover new books, continue reading, and explore curated collections on Lehkhabu — your AI-powered book marketplace.',
  });

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /* Derived data ─────────────────────────────────────── */
  // Hero: top-rated books carousel
  const topBooks = [...books].sort((a, b) => b.average_rating - a.average_rating).slice(0, 5);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (topBooks.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % topBooks.length);
    }, 6000); // changes every 6 seconds
    return () => clearInterval(interval);
  }, [topBooks.length]);

  const heroBook = topBooks[heroIndex];

  // Recommended: offset from top 5
  const recommended = books.filter(b => !topBooks.find(tb => tb.id === b.id)).slice(0, 10);

  // Popular: by purchase count
  const popular = [...books]
    .sort((a, b) => b.purchase_count - a.purchase_count)
    .filter(b => !topBooks.find(tb => tb.id === b.id))
    .slice(0, 6);

  // Currently Reading
  const readingEntries = shelf.filter(s => s.shelf === 'READING' && (s as unknown as { book?: unknown }).book).slice(0, 3);

  // New Arrivals (latest created_at)
  const newArrivals = [...books]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 8);

  return (
    <div className="hb-page">
      
      {/* ── Greeting ────────────────────────────────────── */}
      <div className="hb-greeting">
        <div>
          <div className="hb-greeting-sub">Good reading, 📖</div>
          <h1 className="hb-greeting-name">{firstName}!</h1>
        </div>
      </div>

      {/* ── Hero / Popular card ──────────────────────────── */}
      {booksLoading ? (
        <div className="hb-hero-skeleton" />
      ) : heroBook ? (
        <div 
           key={heroBook.id} 
           className="hb-hero-card" 
           onClick={() => navigate(`/book/${heroBook.id}`)}
           style={{ animation: 'fadeIn 0.5s ease' }}
        >
          <div className="hb-hero-info">
            <div className="hb-hero-badge">🔥 Popular Right Now</div>
            <h2 className="hb-hero-title">{heroBook.title}</h2>
            <div className="hb-hero-author">
              {heroBook.author_name}
              {heroBook.published_at ? ` · ${new Date(heroBook.published_at).getFullYear()}` : ''}
            </div>
            {heroBook.average_rating > 0 && (
              <div className="hb-hero-stars">
                {'★'.repeat(Math.round(heroBook.average_rating))}
                {'☆'.repeat(5 - Math.round(heroBook.average_rating))}
                <span>{heroBook.average_rating.toFixed(1)}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                className="hb-hero-btn"
                onClick={(e) => { e.stopPropagation(); navigate(`/book/${heroBook.id}`); }}
              >
                Read More →
              </button>
              <div onClick={e => e.stopPropagation()}>
                <HeartBtn bookId={heroBook.id} userId={userId} />
              </div>
            </div>
          </div>
          <div className="hb-hero-book-wrap">
            <BookCover book={heroBook} className="hb-hero-cover" />
          </div>
        </div>
      ) : null}

      {/* ── Recommended for You ──────────────────────────── */}
      {!booksLoading && recommended.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.6s ease both', animationDelay: '0.1s' }}>
          <SectionHeader title="Recommended for You ✨" sectionKey="recommended" isExpanded={expandedSections['recommended']} onToggle={toggleSection} />
          {expandedSections['recommended'] ? (
            <div className="hb-grid">
               {recommended.map(book => <GridBookCard key={book.id} book={book} userId={userId} />)}
            </div>
          ) : (
            <BookStrip books={recommended.slice(0, 8)} userId={userId} autoScrollDelay={0} />
          )}
        </div>
      )}

      {/* ── Continue Reading ─────────────────────────────── */}
      {readingEntries.length > 0 && (
        <div className="hb-continue-section" style={{ animation: 'fadeInUp 0.6s ease both', animationDelay: '0.3s' }}>
          <SectionHeader title="Continue Reading 📖" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {readingEntries.map((entry) => {
              const book = (entry as unknown as { book?: Book }).book as Book;
              if (!book) return null;
              return <ContinueReadingCard key={entry.book_id} entry={entry} book={book} />;
            })}
          </div>
        </div>
      )}

      {/* ── Popular Books Grid ───────────────────────────── */}
      {!booksLoading && popular.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.6s ease both', animationDelay: '0.5s' }}>
          <SectionHeader title="Popular This Week 🏆" sectionKey="popular" isExpanded={expandedSections['popular']} onToggle={toggleSection} />
          {expandedSections['popular'] ? (
            <div className="hb-grid">
               {popular.map(book => <GridBookCard key={book.id} book={book} userId={userId} />)}
            </div>
          ) : (
            <BookStrip books={popular} userId={userId} autoScrollDelay={2500} />
          )}
        </div>
      )}

      {/* ── New Arrivals ─────────────────────────────────── */}
      {!booksLoading && newArrivals.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.6s ease both', animationDelay: '0.7s' }}>
          <SectionHeader title="New Arrivals 🆕" sectionKey="new-arrivals" isExpanded={expandedSections['new-arrivals']} onToggle={toggleSection} />
          {expandedSections['new-arrivals'] ? (
            <div className="hb-grid">
               {newArrivals.map(book => <GridBookCard key={book.id} book={book} userId={userId} />)}
            </div>
          ) : (
            <BookStrip books={newArrivals.slice(0, 8)} userId={userId} autoScrollDelay={5000} />
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────── */}
      {!booksLoading && books.length === 0 && (
        <div className="hb-empty">
          <div style={{ fontSize: '3rem' }}>📚</div>
          <h3>No books yet</h3>
          <p>Be the first to publish on Lehkhabu!</p>
          <button className="hb-hero-btn" style={{ marginTop: 16 }} onClick={() => navigate('/explore')}>
            Explore Library
          </button>
        </div>
      )}

      {/* bottom spacing for nav */}
      <div style={{ height: 24 }} />
    </div>
  );
}
