/**
 * AlgoliaSearch.tsx
 *
 * A production-ready Algolia-powered search UI for the ExplorePage.
 * Uses react-instantsearch with a custom UI that matches the Lehkhabu design system.
 *
 * Falls back gracefully to the existing Supabase-based search when Algolia
 * is not configured (VITE_ALGOLIA_APP_ID / VITE_ALGOLIA_SEARCH_KEY missing).
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InstantSearch,
  useSearchBox,
  useHits,
  useRefinementList,
  useClearRefinements,
  useStats,
  useSortBy,
  Configure,
} from 'react-instantsearch';
import { algoliaClient, ALGOLIA_BOOKS_INDEX, isAlgoliaConfigured } from '../../lib/algolia';
import { useBooksStore } from '../../store/booksStore';
import BookCover from '../common/BookCover';
import type { Book } from '../../services/books.service';
import type { AlgoliaBook } from '../../services/algolia.service';

/* ── Sort options ─────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: ALGOLIA_BOOKS_INDEX, label: 'Relevance' },
  { value: `${ALGOLIA_BOOKS_INDEX}_rating_desc`, label: 'Top Rated' },
  { value: `${ALGOLIA_BOOKS_INDEX}_newest`, label: 'Newest' },
  { value: `${ALGOLIA_BOOKS_INDEX}_popular`, label: 'Popular' },
];

/* ── Category emoji map ────────────────────────────────── */
const CAT_EMOJI: Record<string, string> = {
  Romance: '💕', Fantasy: '🐉', Horror: '👻', Historical: '🏛️',
  Biography: '👤', Science: '🔬', 'Self-Help': '🧘', Psychology: '🧠',
  Design: '🎨', Fiction: '📖', Wellness: '🌿', Novel: '📕',
  Poetry: '🎭', Spiritual: '🙏', History: '📜', 'Short Stories': '📝',
};

/* ── Custom Search Box ─────────────────────────────────── */
function AlgoliaSearchBox() {
  const { query, refine } = useSearchBox();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="ep-search-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" className="ep-search-icon">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        id="algolia-search-input"
        type="search"
        className="ep-search-input"
        placeholder="Search books, authors, genres…"
        value={query}
        onChange={(e) => refine(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-label="Search books"
      />
      {query && (
        <button
          className="ep-search-clear"
          onClick={() => { refine(''); inputRef.current?.focus(); }}
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ── Category Refinement List ──────────────────────────── */
function CategoryRefinement() {
  const { items, refine } = useRefinementList({ attribute: 'category', limit: 20 });
  const { refine: clearAll } = useClearRefinements({ includedAttributes: ['category'] });

  return (
    <div className="ep-filter-group">
      <div className="ep-filter-label">Genre</div>
      <div className="ep-cat-grid">
        <button
          className={`ep-cat-pill${items.every(i => !i.isRefined) ? ' ep-cat-pill--active' : ''}`}
          onClick={clearAll}
        >
          📚 All
        </button>
        {items.map((item) => (
          <button
            key={item.label}
            className={`ep-cat-pill${item.isRefined ? ' ep-cat-pill--active' : ''}`}
            onClick={() => refine(item.value)}
          >
            {(CAT_EMOJI[item.label] ?? '📖') + ' ' + item.label}
            <span className="ep-cat-count"> {item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Free-only Toggle ──────────────────────────────────── */
function FreeRefinement() {
  const { items, refine } = useRefinementList({ attribute: 'is_free', limit: 2 });
  const freeItem = items.find(i => i.label === 'true');
  const isActive = freeItem?.isRefined ?? false;

  return (
    <div className="ep-filter-group">
      <div className="ep-filter-label">Availability</div>
      <div className="ep-toggle-row">
        <button
          className={`ep-toggle${isActive ? ' ep-toggle--active' : ''}`}
          onClick={() => freeItem && refine(freeItem.value)}
          disabled={!freeItem}
        >
          🆓 Free only
        </button>
      </div>
    </div>
  );
}

/* ── Sort By Pills ─────────────────────────────────────── */
function SortByRow() {
  const { currentRefinement, refine } = useSortBy({ items: SORT_OPTIONS });

  return (
    <div className="ep-sort-row">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`ep-sort-pill${currentRefinement === opt.value ? ' ep-sort-pill--active' : ''}`}
          onClick={() => refine(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Result Stats ──────────────────────────────────────── */
function ResultStats({ query }: { query: string }) {
  const { nbHits, processingTimeMS } = useStats();

  return (
    <div className="ep-results-header">
      <span className="ep-results-count">
        {nbHits.toLocaleString()} result{nbHits !== 1 ? 's' : ''}
      </span>
      {query && <span className="ep-results-query">for "{query}"</span>}
      <span className="ep-results-time"> · {processingTimeMS}ms</span>
    </div>
  );
}

/* ── Algolia Hit Card ──────────────────────────────────── */
function AlgoliaBookCard({ hit, userId }: { hit: AlgoliaBook; userId?: string }) {
  const navigate = useNavigate();
  const { isInWishlist, toggleWishlist } = useBooksStore();
  const [wlLoading, setWlLoading] = useState(false);
  const active = isInWishlist(hit.id);

  // Convert AlgoliaBook → Book shape for BookCover
  const bookForCover: Partial<Book> & Pick<Book, 'id' | 'title' | 'cover_image_url' | 'cover_color_primary' | 'cover_color_secondary'> = {
    id: hit.id,
    title: hit.title,
    cover_image_url: hit.cover_image_url,
    cover_color_primary: hit.cover_color_primary,
    cover_color_secondary: hit.cover_color_secondary,
  };

  const handleWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || wlLoading) return;
    setWlLoading(true);
    try { await toggleWishlist(userId, hit.id); }
    finally { setWlLoading(false); }
  };

  return (
    <div className="ep-book-card" onClick={() => navigate(`/book/${hit.id}`)}>
      <div className="ep-book-cover-wrap">
        <BookCover book={bookForCover as Book} className="ep-book-cover" />
      </div>
      <div className="ep-book-info">
        <div className="ep-book-meta">
          <span className="ep-book-category">{hit.category}</span>
          {hit.is_free
            ? <span className="ep-badge ep-badge--free">Free</span>
            : <span className="ep-badge ep-badge--premium">Premium</span>
          }
        </div>
        <div className="ep-book-title">{hit.title}</div>
        <div className="ep-book-author">by {hit.author_name}</div>
        {hit.average_rating > 0 && (
          <div className="ep-book-rating">
            <svg viewBox="0 0 24 24" fill="#F5A623" width="12" height="12">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{hit.average_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <button
        className={`ep-heart${active ? ' ep-heart--active' : ''}`}
        onClick={handleWishlist}
        disabled={wlLoading || !userId}
        aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
      >
        <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  );
}

/* ── Hits List ─────────────────────────────────────────── */
function HitsList({ userId }: { userId?: string }) {
  const { items, results } = useHits<AlgoliaBook>();

  if (results && results.nbHits === 0) {
    return (
      <div className="ep-empty">
        <div style={{ fontSize: '2.5rem' }}>🔍</div>
        <h3>No books found</h3>
        <p>Try a different search or clear your filters.</p>
      </div>
    );
  }

  return (
    <div className="ep-results-list">
      {items.map((hit) => (
        <AlgoliaBookCard key={hit.objectID} hit={hit} userId={userId} />
      ))}
    </div>
  );
}

/* ── Filter Panel ──────────────────────────────────────── */
function FilterPanel({ onClose }: { onClose: () => void }) {
  const { canRefine, refine: clearAll } = useClearRefinements();

  return (
    <div className="ep-filter-panel">
      <CategoryRefinement />
      <FreeRefinement />
      {canRefine && (
        <button className="ep-clear-filters" onClick={() => { clearAll(); onClose(); }}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

/* ── Filter Toggle Button with badge ──────────────────── */
function FilterToggle({ onClick, activeCount }: { onClick: () => void; activeCount: number }) {
  return (
    <button
      className={`ep-filter-btn${activeCount > 0 ? ' ep-filter-btn--active' : ''}`}
      onClick={onClick}
      aria-label="Filters"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
        <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
      </svg>
      {activeCount > 0 && <span className="ep-filter-badge">{activeCount}</span>}
    </button>
  );
}

/* ── Inner search UI (must be inside InstantSearch) ─────── */
function AlgoliaSearchUI({ userId }: { userId?: string }) {
  const { query } = useSearchBox();
  const [showFilters, setShowFilters] = useState(false);
  const { items: catItems } = useRefinementList({ attribute: 'category', limit: 20 });
  const { items: freeItems } = useRefinementList({ attribute: 'is_free', limit: 2 });
  const activeCount = [
    catItems.some(i => i.isRefined),
    freeItems.some(i => i.isRefined),
  ].filter(Boolean).length;

  return (
    <>
      {/* Search bar row */}
      <div className="ep-search-wrap">
        <AlgoliaSearchBox />
        <FilterToggle onClick={() => setShowFilters(v => !v)} activeCount={activeCount} />
      </div>

      {/* Sort pills */}
      <SortByRow />

      {/* Filter panel */}
      {showFilters && <FilterPanel onClose={() => setShowFilters(false)} />}

      {/* Stats */}
      <ResultStats query={query} />

      {/* Hits */}
      <Configure hitsPerPage={20} distinct />
      <HitsList userId={userId} />
    </>
  );
}

/* ── Main Export: Algolia Search Page ──────────────────── */
export default function AlgoliaSearch({ userId }: { userId?: string }) {
  if (!isAlgoliaConfigured || !algoliaClient) {
    return <AlgoliaNotConfigured />;
  }

  return (
    <InstantSearch
      searchClient={algoliaClient}
      indexName={ALGOLIA_BOOKS_INDEX}
      future={{ preserveSharedStateOnUnmount: true }}
    >
      <AlgoliaSearchUI userId={userId} />
    </InstantSearch>
  );
}

/* ── Fallback when Algolia not configured ──────────────── */
function AlgoliaNotConfigured() {
  // This will never render in production with proper env vars
  // Shows a dev-mode hint
  if (import.meta.env.PROD) return null;

  return (
    <div style={{
      padding: '16px 20px',
      background: 'rgba(139,94,60,0.08)',
      borderRadius: 12,
      border: '1px dashed #8B5E3C',
      margin: '12px 0',
      fontSize: '0.8rem',
      color: '#8B5E3C',
      lineHeight: 1.6,
    }}>
      <strong>🔍 Algolia not configured.</strong> Add <code>VITE_ALGOLIA_APP_ID</code> and{' '}
      <code>VITE_ALGOLIA_SEARCH_KEY</code> to your <code>.env</code> to enable instant search.
      <br />Using Supabase full-text search as fallback.
    </div>
  );
}

