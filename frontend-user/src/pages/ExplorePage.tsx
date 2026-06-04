/**
 * ExplorePage.tsx
 *
 * Uses Algolia InstantSearch when configured (VITE_ALGOLIA_APP_ID + VITE_ALGOLIA_SEARCH_KEY).
 * Falls back seamlessly to the existing Supabase in-memory search when not configured.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useBooksStore } from '../store/booksStore';
import { useAuthStore } from '../store/authStore';
import BookCover from '../components/common/BookCover';
import AlgoliaSearch from '../components/search/AlgoliaSearch';
import { isAlgoliaConfigured } from '../lib/algolia';
import { usePageMeta } from '../hooks/usePageMeta';
import type { Book } from '../services/books.service';

/* ── Sort options ─────────────────────────────────────────── */
type SortKey = 'relevance' | 'rating' | 'newest' | 'popular' | 'title';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'rating',    label: 'Top Rated'  },
  { key: 'newest',    label: 'Newest'     },
  { key: 'popular',   label: 'Popular'    },
  { key: 'title',     label: 'A → Z'      },
];

/* ── Category emoji map ────────────────────────────────────── */
const CAT_EMOJI: Record<string, string> = {
  Romance: '💕', Fantasy: '🐉', Horror: '👻', Historical: '🏛️',
  Biography: '👤', Science: '🔬', 'Self-Help': '🧘', Psychology: '🧠',
  Design: '🎨', Fiction: '📖', Wellness: '🌿', Novel: '📕',
  Poetry: '🎭', Spiritual: '🙏', History: '📜', 'Short Stories': '📝',
};

/* ── Search result card (Supabase fallback) ────────────────── */
function SearchBookCard({ book, userId }: { book: Book; userId?: string }) {
  const navigate = useNavigate();
  const { isInWishlist, toggleWishlist } = useBooksStore();
  const [wlLoading, setWlLoading] = useState(false);
  const active = isInWishlist(book.id);

  const handleWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || wlLoading) return;
    setWlLoading(true);
    try { await toggleWishlist(userId, book.id); }
    finally { setWlLoading(false); }
  };

  return (
    <div className="ep-book-card" onClick={() => navigate(`/book/${book.id}`)}>
      {/* 3D book cover */}
      <div className="ep-book-cover-wrap">
        <BookCover book={book} className="ep-book-cover" />
      </div>

      {/* Info */}
      <div className="ep-book-info">
        <div className="ep-book-meta">
          <span className="ep-book-category">{book.category}</span>
          {book.is_free && <span className="ep-badge ep-badge--free">Free</span>}
          {!book.is_free && <span className="ep-badge ep-badge--premium">Premium</span>}
        </div>
        <div className="ep-book-title">{book.title}</div>
        <div className="ep-book-author">by {book.author_name}</div>
        {book.average_rating > 0 && (
          <div className="ep-book-rating">
            <svg viewBox="0 0 24 24" fill="#F5A623" width="12" height="12">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{book.average_rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* heart */}
      <button
        className={`ep-heart${active ? ' ep-heart--active' : ''}`}
        onClick={handleWishlist}
        disabled={wlLoading || !userId}
        aria-label="Wishlist"
      >
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  );
}

/* ── Supabase fallback search ──────────────────────────────── */
function SupabaseSearch({ userId }: { userId?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { books, booksLoading, loadBooks } = useBooksStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query,      setQuery ]     = useState(searchParams.get('q') ?? '');
  const [category,   setCategory]   = useState(searchParams.get('cat') ?? '');
  const [sortKey,    setSortKey]     = useState<SortKey>('relevance');
  const [showFree,   setShowFree]    = useState(false);
  const [minRating,  setMinRating]   = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBooks]);

  // Sync URL params
  useEffect(() => {
    const p: Record<string, string> = {};
    if (query)    p.q   = query;
    if (category) p.cat = category;
    setSearchParams(p, { replace: true });
  }, [query, category, setSearchParams]);

  /* Unique categories ─────────────────────────────────── */
  const categories = useMemo(
    () => ['', ...[...new Set(books.map(b => b.category))].sort()],
    [books]
  );

  /* Filter + Sort ─────────────────────────────────────── */
  const results = useMemo(() => {
    let list = [...books];

    // category filter
    if (category) list = list.filter(b => b.category === category);

    // free filter
    if (showFree) list = list.filter(b => b.is_free);

    // min rating filter
    if (minRating > 0) list = list.filter(b => b.average_rating >= minRating);

    // text search
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        b =>
          b.title.toLowerCase().includes(q) ||
          (b.author_name ?? '').toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          (b.description ?? '').toLowerCase().includes(q) ||
          b.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // sort
    switch (sortKey) {
      case 'rating':  list.sort((a, b) => b.average_rating - a.average_rating); break;
      case 'newest':  list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()); break;
      case 'popular': list.sort((a, b) => b.purchase_count - a.purchase_count); break;
      case 'title':   list.sort((a, b) => a.title.localeCompare(b.title)); break;
    }

    return list;
  }, [books, query, category, showFree, minRating, sortKey]);

  const isFiltered = query || category || showFree || minRating > 0;
  const activeFilterCount = [category, showFree, minRating > 0].filter(Boolean).length;
  console.log('[DEBUG] Store books:', books);
  console.log('[DEBUG] Filtered results:', results);

  return (
    <>
      {/* ── Search bar ─────────────────────────────────── */}
      <div className="ep-search-wrap">
        <div className="ep-search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ep-search-icon">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            id="search-input"
            type="text"
            className="ep-search-input"
            placeholder="Search books, authors, genres..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button className="ep-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          className={`ep-filter-btn${activeFilterCount > 0 ? ' ep-filter-btn--active' : ''}`}
          onClick={() => setShowFilters(v => !v)}
          aria-label="Filters"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          {activeFilterCount > 0 && <span className="ep-filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {/* ── Sort pills ─────────────────────────────────── */}
      <div className="ep-sort-row">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`ep-sort-pill${sortKey === opt.key ? ' ep-sort-pill--active' : ''}`}
            onClick={() => setSortKey(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Filter panel ───────────────────────────────── */}
      {showFilters && (
        <div className="ep-filter-panel">
          {/* Category */}
          <div className="ep-filter-group">
            <div className="ep-filter-label">Genre</div>
            <div className="ep-cat-grid">
              {categories.map(cat => (
                <button
                  key={cat || 'all'}
                  className={`ep-cat-pill${category === cat ? ' ep-cat-pill--active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat ? (CAT_EMOJI[cat] ?? '📖') + ' ' + cat : '📚 All'}
                </button>
              ))}
            </div>
          </div>

          {/* Availability */}
          <div className="ep-filter-group">
            <div className="ep-filter-label">Availability</div>
            <div className="ep-toggle-row">
              <button
                className={`ep-toggle${showFree ? ' ep-toggle--active' : ''}`}
                onClick={() => setShowFree(v => !v)}
              >
                🆓 Free only
              </button>
            </div>
          </div>

          {/* Min rating */}
          <div className="ep-filter-group">
            <div className="ep-filter-label">Minimum Rating</div>
            <div className="ep-rating-row">
              {[0, 3, 3.5, 4, 4.5].map(r => (
                <button
                  key={r}
                  className={`ep-rating-pill${minRating === r ? ' ep-rating-pill--active' : ''}`}
                  onClick={() => setMinRating(r)}
                >
                  {r === 0 ? 'Any' : `${r}★+`}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <button
              className="ep-clear-filters"
              onClick={() => { setCategory(''); setShowFree(false); setMinRating(0); }}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Results header ─────────────────────────────── */}
      {!booksLoading && (
        <div className="ep-results-header">
          {isFiltered ? (
            <>
              <span className="ep-results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
              {query && <span className="ep-results-query">for "{query}"</span>}
            </>
          ) : (
            <span className="ep-results-count">{results.length} books available</span>
          )}
        </div>
      )}

      {/* ── Loading ────────────────────────────────────── */}
      {booksLoading && (
        <div className="ep-skeleton-list">
          {[...Array(6)].map((_, i) => <div key={i} className="ep-skeleton-card" />)}
        </div>
      )}

      {/* ── Results list ───────────────────────────────── */}
      {!booksLoading && results.length > 0 && (
        <div className="ep-results-list">
          {results.map(book => (
            <SearchBookCard key={book.id} book={book} userId={userId} />
          ))}
        </div>
      )}

      {/* ── No results ─────────────────────────────────── */}
      {!booksLoading && results.length === 0 && (
        <div className="ep-empty">
          <div style={{ fontSize: '2.5rem' }}>🔍</div>
          <h3>No books found</h3>
          <p>Try a different search or clear your filters.</p>
          {isFiltered && (
            <button
              className="ep-clear-filters"
              style={{ marginTop: 12 }}
              onClick={() => { setQuery(''); setCategory(''); setShowFree(false); setMinRating(0); }}
            >
              Clear everything
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* ── Main ExplorePage ──────────────────────────────────────── */
export default function ExplorePage() {
  const { profile } = useAuthStore();
  const userId = profile?.id;

  usePageMeta({
    title: 'Explore Books',
    description: 'Discover thousands of books across all genres. Search by title, author, or category with instant results.',
  });

  return (
    <div className="ep-page">
      {isAlgoliaConfigured ? (
        <AlgoliaSearch userId={userId} />
      ) : (
        <SupabaseSearch userId={userId} />
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}
