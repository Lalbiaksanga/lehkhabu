import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchBookById } from '../services/books.service';
import { checkOwnership } from '../services/purchases.service';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import type { Book } from '../services/books.service';

/* ────────────────────────────────────────────────────────────────────── */
/*  Types & Configuration                                                */
/* ────────────────────────────────────────────────────────────────────── */

type ThemeKey = 'light' | 'sepia' | 'dark';
type FontFamily = 'serif' | 'sans';
type FontSizeKey = 'small' | 'medium' | 'large';

interface Theme {
  bg: string;
  text: string;
  muted: string;
  border: string;
  toolbar: string;
  progressBg: string;
  progressFill: string;
  chapterBg: string;
  chapterBorder: string;
  pageSep: string;
}

const THEMES: Record<ThemeKey, Theme> = {
  light: {
    bg: '#FFFFFF',
    text: '#1C1C1E',
    muted: '#8E8E93',
    border: 'rgba(0,0,0,0.06)',
    toolbar: 'rgba(255,255,255,0.96)',
    progressBg: 'rgba(0,0,0,0.06)',
    progressFill: '#C17817',
    chapterBg: 'rgba(0,0,0,0.02)',
    chapterBorder: 'rgba(0,0,0,0.08)',
    pageSep: 'rgba(0,0,0,0.06)',
  },
  sepia: {
    bg: '#F8F0E3',
    text: '#3A2A1A',
    muted: '#9A7B5A',
    border: 'rgba(0,0,0,0.06)',
    toolbar: 'rgba(248,240,227,0.96)',
    progressBg: 'rgba(0,0,0,0.06)',
    progressFill: '#A86523',
    chapterBg: 'rgba(160,120,60,0.06)',
    chapterBorder: 'rgba(160,120,60,0.15)',
    pageSep: 'rgba(160,120,60,0.12)',
  },
  dark: {
    bg: '#1A1A2E',
    text: '#E8E4DC',
    muted: '#7A7A8E',
    border: 'rgba(255,255,255,0.06)',
    toolbar: 'rgba(26,26,46,0.96)',
    progressBg: 'rgba(255,255,255,0.08)',
    progressFill: '#D4943A',
    chapterBg: 'rgba(255,255,255,0.03)',
    chapterBorder: 'rgba(255,255,255,0.06)',
    pageSep: 'rgba(255,255,255,0.06)',
  },
};

const FONT_FAMILIES: Record<FontFamily, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Inter", system-ui, -apple-system, sans-serif',
};

const FONT_SIZES: Record<FontSizeKey, number> = {
  small: 16,
  medium: 18,
  large: 22,
};

interface ChunkRow {
  id: string;
  chunk_index: number;
  page_number: number | null;
  chapter_title: string | null;
  section_title: string | null;
  parent_text: string;
}

interface PageGroup {
  pageNumber: number;
  chapterTitle: string | null;
  chunks: ChunkRow[];
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Component                                                            */
/* ────────────────────────────────────────────────────────────────────── */

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  /* ── Book + access ─────────────────────────────────────────── */
  const [book, setBook] = useState<Book | null | 'loading'>('loading');
  const [bookLoadError, setBookLoadError] = useState(false);
  const [accessGranted, setAccessGranted] = useState<boolean | null>(null);

  /* ── Chunks ────────────────────────────────────────────────── */
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [chunksLoading, setChunksLoading] = useState(true);
  const [chunksError, setChunksError] = useState<string | null>(null);

  /* ── Reader settings ───────────────────────────────────────── */
  const [theme, setTheme] = useState<ThemeKey>('sepia');
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif');
  const [fontSize, setFontSize] = useState<FontSizeKey>('medium');
  const [showToolbar, setShowToolbar] = useState(false);

  /* ── Progress ──────────────────────────────────────────────── */
  const [scrollPercent, setScrollPercent] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialScrollDone = useRef(false);
  const [savedPage, setSavedPage] = useState<number | null>(null);

  const t = THEMES[theme];

  /* ── Fetch book and check access ───────────────────────────── */
  useEffect(() => {
    if (!id) { setBook(null); return; }
    setBook('loading');
    fetchBookById(id)
      .then(async (b) => {
        setBook(b);
        if (!b) { setAccessGranted(false); return; }
        if (b.is_free) { setAccessGranted(true); }
        else if (!profile?.id) { setAccessGranted(false); return; }
        else {
          const owned = await checkOwnership(profile.id, b.id);
          setAccessGranted(owned);
        }

        // Restore reading progress
        if (profile?.id) {
          const { data: progress } = await supabase
            .from('reading_progress')
            .select('current_page')
            .eq('user_id', profile.id)
            .eq('book_id', id)
            .maybeSingle();
          if (progress?.current_page) {
            setSavedPage(progress.current_page);
          }
        }
      })
      .catch(() => { setBook(null); setBookLoadError(true); setAccessGranted(false); });
  }, [id, profile?.id]);

  // Redirect if not owned
  useEffect(() => {
    if (accessGranted === false && book && book !== 'loading') {
      navigate(`/book/${id}`, { replace: true });
    }
  }, [accessGranted, book, id, navigate]);

  /* ── Fetch chunks from book_chunks ─────────────────────────── */
  useEffect(() => {
    if (!id || accessGranted !== true) return;
    setChunksLoading(true);
    setChunksError(null);

    supabase
      .from('book_chunks')
      .select('id, chunk_index, page_number, chapter_title, section_title, parent_text')
      .eq('book_id', id)
      .order('chunk_index', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load book chunks:', error);
          setChunksError('Failed to load book content. Please try again.');
          setChunksLoading(false);
          return;
        }
        if (!data || data.length === 0) {
          setChunksError('This book has not been processed for reading yet.');
          setChunksLoading(false);
          return;
        }
        setChunks(data as ChunkRow[]);
        setChunksLoading(false);
      });
  }, [id, accessGranted]);

  /* ── Deduplicate parent_text and group into pages ───────────── */
  const pages = useMemo<PageGroup[]>(() => {
    if (chunks.length === 0) return [];

    // Deduplicate: parent_text can repeat across child chunks
    const seen = new Set<string>();
    const unique: ChunkRow[] = [];
    for (const chunk of chunks) {
      if (!seen.has(chunk.parent_text)) {
        seen.add(chunk.parent_text);
        unique.push(chunk);
      }
    }

    // Group by page_number (or by chapter if all page_numbers are the same)
    const allSamePage = unique.every(c => c.page_number === unique[0].page_number);

    if (allSamePage) {
      // If the parser didn't produce distinct pages, create synthetic pages
      // by grouping N chunks per page for a comfortable reading experience
      const CHUNKS_PER_PAGE = 4;
      const result: PageGroup[] = [];
      for (let i = 0; i < unique.length; i += CHUNKS_PER_PAGE) {
        const slice = unique.slice(i, i + CHUNKS_PER_PAGE);
        result.push({
          pageNumber: result.length + 1,
          chapterTitle: slice[0].chapter_title,
          chunks: slice,
        });
      }
      return result;
    }

    // Real page numbers exist — group by them
    const pageMap = new Map<number, ChunkRow[]>();
    for (const chunk of unique) {
      const pn = chunk.page_number ?? 0;
      if (!pageMap.has(pn)) pageMap.set(pn, []);
      pageMap.get(pn)!.push(chunk);
    }
    return Array.from(pageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([pn, pChunks]) => ({
        pageNumber: pn,
        chapterTitle: pChunks[0].chapter_title,
        chunks: pChunks,
      }));
  }, [chunks]);

  const totalPages = pages.length;

  /* ── Scroll handler → progress bar + current page ──────────── */
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const pct = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
    setScrollPercent(pct);

    // Determine which page is currently in view
    let visiblePage = 1;
    for (const [pgNum, pgEl] of pageRefs.current.entries()) {
      const rect = pgEl.getBoundingClientRect();
      const containerTop = el.getBoundingClientRect().top;
      if (rect.top - containerTop < el.clientHeight * 0.4) {
        visiblePage = pgNum;
      }
    }
    setCurrentPage(visiblePage);
  }, []);

  /* ── Scroll to saved page after chunks load ────────────────── */
  useEffect(() => {
    if (savedPage && pages.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      // Small delay to let DOM render
      setTimeout(() => {
        const targetEl = pageRefs.current.get(savedPage);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 100);
    }
  }, [savedPage, pages]);

  /* ── Save reading progress ─────────────────────────────────── */
  useEffect(() => {
    if (!profile?.id || !id || book === 'loading' || !book || totalPages === 0) return;

    const percentage = Math.min(100, Math.round((currentPage / totalPages) * 100));

    const saveProgress = async () => {
      await supabase
        .from('reading_progress')
        .upsert({
          user_id: profile.id,
          book_id: id,
          current_page: currentPage,
          percentage,
          last_read_at: new Date().toISOString(),
        }, { onConflict: 'user_id,book_id' });
    };

    // Save on page change (debounced)
    const debounce = setTimeout(saveProgress, 1500);

    // Also save every 30 seconds
    if (!progressTimerRef.current) {
      progressTimerRef.current = setInterval(saveProgress, 30000);
    }

    return () => { clearTimeout(debounce); };
  }, [currentPage, profile?.id, id, book, totalPages]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  /* ── Keyboard: Escape to go back ───────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate]);

  /* ────────────────────────────────────────────────────────────── */
  /*  Render: Loading                                               */
  /* ────────────────────────────────────────────────────────────── */
  if (book === 'loading') return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: t.bg, zIndex: 2000,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📖</div>
        <div style={{ fontFamily: FONT_FAMILIES.serif, color: t.muted, fontSize: '1rem' }}>
          Loading book…
        </div>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────────────────────── */
  /*  Render: Not found                                             */
  /* ────────────────────────────────────────────────────────────── */
  if (!book) return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: t.bg, flexDirection: 'column',
      gap: 16, zIndex: 2000,
    }}>
      <div style={{ fontSize: '3rem' }}>📖</div>
      <div style={{ fontFamily: FONT_FAMILIES.serif, fontSize: '1.2rem', color: t.text }}>
        {bookLoadError ? 'Failed to load book' : 'Book not found'}
      </div>
      <button onClick={() => navigate('/')} style={btnStyle}>Go Home</button>
    </div>
  );

  /* ────────────────────────────────────────────────────────────── */
  /*  Render: Loading chunks                                        */
  /* ────────────────────────────────────────────────────────────── */
  if (chunksLoading) return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: t.bg, zIndex: 2000,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📖</div>
        <div style={{ fontFamily: FONT_FAMILIES.serif, color: t.text, fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>
          {book.title}
        </div>
        <div style={{ fontFamily: FONT_FAMILIES.sans, color: t.muted, fontSize: '0.88rem' }}>
          Loading content…
        </div>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────────────────────── */
  /*  Render: Chunks error / not ingested                           */
  /* ────────────────────────────────────────────────────────────── */
  if (chunksError || pages.length === 0) return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: t.bg, flexDirection: 'column',
      gap: 16, padding: 32, zIndex: 2000,
    }}>
      <div style={{ fontSize: '3rem' }}>📄</div>
      <div style={{ fontFamily: FONT_FAMILIES.serif, fontSize: '1.15rem', color: t.text, fontWeight: 600 }}>
        {book.title}
      </div>
      <div style={{
        maxWidth: 420, textAlign: 'center', lineHeight: 1.7,
        padding: '20px 24px', borderRadius: 12,
        background: t.chapterBg,
        border: `1px solid ${t.chapterBorder}`,
      }}>
        <div style={{ color: t.muted, fontSize: '0.92rem', fontFamily: FONT_FAMILIES.sans }}>
          {chunksError || 'This book has not been processed for reading yet. The AI ingestion pipeline needs to run before the text content is available.'}
        </div>
      </div>
      <button onClick={() => navigate(-1)} style={btnStyle}>← Go Back</button>
    </div>
  );

  /* ────────────────────────────────────────────────────────────── */
  /*  Render: The reader                                            */
  /* ────────────────────────────────────────────────────────────── */
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', flexDirection: 'column',
      background: t.bg,
      transition: 'background 0.3s ease',
    }}>
      {/* ── Progress bar (top) ──────────────────────────────────── */}
      <div style={{
        height: 3, width: '100%', background: t.progressBg, flexShrink: 0,
      }}>
        <div style={{
          height: '100%',
          width: `${scrollPercent}%`,
          background: t.progressFill,
          transition: 'width 0.15s ease-out',
          borderRadius: '0 2px 2px 0',
        }} />
      </div>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12, flexShrink: 0,
        borderBottom: `1px solid ${t.border}`,
        background: t.toolbar,
        backdropFilter: 'blur(12px)',
      }}>
        <button onClick={() => navigate(-1)} style={{
          color: t.muted, background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontFamily: FONT_FAMILIES.sans,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span style={{
          flex: 1, textAlign: 'center', color: t.text,
          fontFamily: FONT_FAMILIES.serif, fontSize: 15, fontWeight: 600,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          padding: '0 8px',
        }}>
          {book.title}
        </span>
        <span style={{
          color: t.muted, fontSize: 12, fontFamily: FONT_FAMILIES.sans,
          whiteSpace: 'nowrap',
        }}>
          {currentPage}/{totalPages} · {scrollPercent}%
        </span>
      </div>

      {/* ── Scrollable content ──────────────────────────────────── */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{
          maxWidth: 680, margin: '0 auto',
          padding: '40px 24px 120px 24px',
        }}>
          {/* Book title header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h1 style={{
              fontFamily: FONT_FAMILIES.serif,
              fontSize: FONT_SIZES[fontSize] * 1.5,
              fontWeight: 700, color: t.text, margin: 0,
              lineHeight: 1.3,
            }}>
              {book.title}
            </h1>
            {book.author_name && (
              <div style={{
                fontFamily: FONT_FAMILIES.sans,
                fontSize: FONT_SIZES[fontSize] * 0.8,
                color: t.muted, marginTop: 12,
              }}>
                by {book.author_name}
              </div>
            )}
            <div style={{
              width: 48, height: 2, background: t.progressFill,
              margin: '24px auto 0', borderRadius: 1, opacity: 0.6,
            }} />
          </div>

          {/* Pages */}
          {pages.map((page, pageIdx) => {
            const showChapterHeader = pageIdx === 0 ||
              page.chapterTitle !== pages[pageIdx - 1].chapterTitle;

            return (
              <div
                key={page.pageNumber}
                ref={(el) => {
                  if (el) pageRefs.current.set(page.pageNumber, el);
                }}
                style={{ marginBottom: 32 }}
              >
                {/* Chapter header */}
                {showChapterHeader && page.chapterTitle && (
                  <div style={{
                    padding: '20px 24px',
                    margin: pageIdx > 0 ? '40px 0 28px' : '0 0 28px',
                    background: t.chapterBg,
                    border: `1px solid ${t.chapterBorder}`,
                    borderRadius: 12,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: FONT_SIZES[fontSize] * 0.65,
                      fontFamily: FONT_FAMILIES.sans,
                      color: t.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '1.5px',
                      fontWeight: 600,
                      marginBottom: 6,
                    }}>
                      Chapter
                    </div>
                    <div style={{
                      fontFamily: FONT_FAMILIES.serif,
                      fontSize: FONT_SIZES[fontSize] * 1.1,
                      fontWeight: 700,
                      color: t.text,
                      lineHeight: 1.4,
                    }}>
                      {page.chapterTitle}
                    </div>
                  </div>
                )}

                {/* Chunk paragraphs */}
                {page.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    style={{
                      fontFamily: FONT_FAMILIES[fontFamily],
                      fontSize: FONT_SIZES[fontSize],
                      lineHeight: 1.85,
                      color: t.text,
                      marginBottom: 20,
                      textAlign: 'justify',
                      hyphens: 'auto' as const,
                      wordBreak: 'break-word',
                    }}
                  >
                    {chunk.parent_text.split('\n').map((para, i) => (
                      para.trim() ? (
                        <p key={i} style={{ margin: '0 0 12px 0' }}>{para}</p>
                      ) : null
                    ))}
                  </div>
                ))}

                {/* Page separator */}
                {pageIdx < pages.length - 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    margin: '16px 0 8px',
                  }}>
                    <div style={{ flex: 1, height: 1, background: t.pageSep }} />
                    <span style={{
                      fontSize: 11, color: t.muted,
                      fontFamily: FONT_FAMILIES.sans,
                      whiteSpace: 'nowrap',
                    }}>
                      {page.pageNumber}
                    </span>
                    <div style={{ flex: 1, height: 1, background: t.pageSep }} />
                  </div>
                )}
              </div>
            );
          })}

          {/* End of book */}
          <div style={{
            textAlign: 'center', padding: '48px 0 32px',
            borderTop: `1px solid ${t.pageSep}`,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📖</div>
            <div style={{
              fontFamily: FONT_FAMILIES.serif, fontSize: '1.1rem',
              color: t.text, fontWeight: 600, marginBottom: 6,
            }}>
              End of Book
            </div>
            <div style={{
              fontFamily: FONT_FAMILIES.sans, fontSize: '0.85rem',
              color: t.muted,
            }}>
              {book.title} {book.author_name ? `by ${book.author_name}` : ''}
            </div>
            <button onClick={() => navigate(-1)} style={{
              ...btnStyle, marginTop: 24,
            }}>
              ← Back to Book
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating toolbar toggle ─────────────────────────────── */}
      <button
        onClick={() => setShowToolbar(!showToolbar)}
        style={{
          position: 'fixed', bottom: 20, right: 20,
          width: 44, height: 44, borderRadius: '50%',
          background: t.progressFill,
          color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 2010,
          transition: 'transform 0.2s',
          transform: showToolbar ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {showToolbar ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </>
          )}
        </svg>
      </button>

      {/* ── Floating toolbar panel ──────────────────────────────── */}
      {showToolbar && (
        <div style={{
          position: 'fixed', bottom: 72, right: 20, left: 20,
          maxWidth: 420, marginLeft: 'auto',
          background: t.toolbar,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          padding: '20px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          zIndex: 2010,
        }}>
          {/* Font Size */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.muted,
              fontFamily: FONT_FAMILIES.sans,
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: 8,
            }}>Font Size</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['small', 'medium', 'large'] as FontSizeKey[]).map(key => (
                <button key={key} onClick={() => setFontSize(key)} style={{
                  flex: 1, padding: '8px 0',
                  borderRadius: 8, border: `1px solid ${t.border}`,
                  background: fontSize === key ? t.progressFill : 'transparent',
                  color: fontSize === key ? '#fff' : t.text,
                  fontFamily: FONT_FAMILIES.sans,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  {key === 'small' ? 'A' : key === 'medium' ? 'A' : 'A'}
                  <span style={{ fontSize: key === 'small' ? 11 : key === 'medium' ? 13 : 16 }}></span>
                  <span style={{ fontSize: 10, display: 'block', fontWeight: 400, marginTop: 2 }}>
                    {FONT_SIZES[key]}px
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.muted,
              fontFamily: FONT_FAMILIES.sans,
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: 8,
            }}>Font</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['serif', 'sans'] as FontFamily[]).map(key => (
                <button key={key} onClick={() => setFontFamily(key)} style={{
                  flex: 1, padding: '8px 0',
                  borderRadius: 8, border: `1px solid ${t.border}`,
                  background: fontFamily === key ? t.progressFill : 'transparent',
                  color: fontFamily === key ? '#fff' : t.text,
                  fontFamily: FONT_FAMILIES[key],
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  {key === 'serif' ? 'Serif' : 'Sans'}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.muted,
              fontFamily: FONT_FAMILIES.sans,
              textTransform: 'uppercase', letterSpacing: '1px',
              marginBottom: 8,
            }}>Theme</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['light', 'sepia', 'dark'] as ThemeKey[]).map(key => (
                <button key={key} onClick={() => setTheme(key)} style={{
                  flex: 1, padding: '10px 0',
                  borderRadius: 8,
                  border: theme === key
                    ? `2px solid ${THEMES[key].progressFill}`
                    : `1px solid ${t.border}`,
                  background: THEMES[key].bg,
                  color: THEMES[key].text,
                  fontFamily: FONT_FAMILIES.sans,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared button style ──────────────────────────────────────────── */
const btnStyle: React.CSSProperties = {
  padding: '10px 28px',
  background: '#C17817',
  color: '#fff',
  borderRadius: 99,
  fontWeight: 600,
  fontFamily: '"Inter", system-ui, sans-serif',
  cursor: 'pointer',
  border: 'none',
  fontSize: '0.9rem',
};
