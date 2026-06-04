import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useBooksStore } from '../store/booksStore';
import { ALL_ACHIEVEMENTS, type Achievement, type AchievementContext } from './ProfilePage';
import '../assets/styles/pages/AchievementsPage.css';
/* ── Category config ─────────────────────────────────── */
const CATEGORIES = [
  { key: 'all',      label: 'All',      icon: '🏅' },
  { key: 'reading',  label: 'Reading',  icon: '📚' },
  { key: 'streak',   label: 'Journey',  icon: '🌟' },
  { key: 'author',   label: 'Author',   icon: '✍️' },
  { key: 'social',   label: 'Social',   icon: '🤝' },
  { key: 'explorer', label: 'Explorer', icon: '🗺️' },
] as const;

/* ── Hexagon SVG badge ─────────────────────────────── */
function HexBadge({ ach, unlocked, size = 80 }: { ach: Achievement; unlocked: boolean; size?: number }) {
  return (
    <div
      className={`ach-hex ${unlocked ? 'ach-hex-unlocked' : 'ach-hex-locked'}`}
      style={{
        width: size, height: size,
        ...(unlocked ? { '--hex-grad': ach.bgGradient } as React.CSSProperties : {}),
      }}
    >
      <div className="ach-hex-glow" />
      <div className="ach-hex-face">
        {unlocked ? (
          <>
            <span className="ach-hex-icon">{ach.icon}</span>
            {unlocked && <div className="ach-hex-sparkle">✦</div>}
          </>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ach-lock-icon">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        )}
      </div>
    </div>
  );
}

/* ── Achievement card ──────────────────────────────── */
function AchCard({
  ach, unlocked, onTap,
}: { ach: Achievement; unlocked: boolean; onTap: () => void }) {
  return (
    <button
      className={`ach-card ${unlocked ? 'ach-card-unlocked' : 'ach-card-locked'}`}
      onClick={onTap}
      aria-label={ach.title}
    >
      <HexBadge ach={ach} unlocked={unlocked} size={72} />
      <div className="ach-card-info">
        <span className="ach-card-title">{ach.title}</span>
        <span className="ach-card-desc">{ach.description}</span>
        {unlocked && <span className="ach-card-unlocked-tag">✓ Unlocked</span>}
      </div>
    </button>
  );
}

/* ── Detail modal ──────────────────────────────────── */
function AchModal({ ach, unlocked, onClose }: { ach: Achievement; unlocked: boolean; onClose: () => void }) {
  return (
    <div className="ach-modal-backdrop" onClick={onClose}>
      <div className="ach-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ach-modal-badge-wrap">
          <HexBadge ach={ach} unlocked={unlocked} size={110} />
        </div>
        <h2 className="ach-modal-title">{ach.title}</h2>
        <p className="ach-modal-desc">{ach.description}</p>
        <div className="ach-modal-category">
          {CATEGORIES.find(c => c.key === ach.category)?.icon} {ach.category.charAt(0).toUpperCase() + ach.category.slice(1)}
        </div>
        {unlocked ? (
          <div className="ach-modal-status ach-status-unlocked">🎉 Achievement Unlocked!</div>
        ) : (
          <div className="ach-modal-status ach-status-locked">🔒 Keep going to unlock this</div>
        )}
        <button className="ach-modal-close" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { shelf, purchases } = useBooksStore();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedAch, setSelectedAch] = useState<Achievement | null>(null);

  const isAuthor = profile?.role === 'AUTHOR' || profile?.role === 'ADMIN';

  const readCount    = useMemo(() => shelf.filter((s) => s.shelf === 'READ').length, [shelf]);
  const readingCount = useMemo(() => shelf.filter((s) => s.shelf === 'READING').length, [shelf]);
  const wantCount    = useMemo(() => shelf.filter((s) => s.shelf === 'WANT_TO_READ').length, [shelf]);
  const totalShelf   = shelf.length;
  const purchaseCount = purchases.length;

  const daysSinceMember = useMemo(() => {
    if (!profile?.created_at) return 0;
    return Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
  }, [profile?.created_at]);

  const categoriesExplored = useMemo(() => {
    const cats = new Set<string>();
    shelf.forEach((entry) => {
      const book = (entry as unknown as { book?: { category?: string } | null }).book;
      if (book?.category) cats.add(book.category);
    });
    return cats;
  }, [shelf]);

  const achCtx: AchievementContext = useMemo(() => ({
    readCount, readingCount, wantCount, purchaseCount,
    isAuthor, daysSinceMember, totalShelf, categories: categoriesExplored,
  }), [readCount, readingCount, wantCount, purchaseCount, isAuthor, daysSinceMember, totalShelf, categoriesExplored]);

  const unlockedIds = useMemo(() =>
    new Set(ALL_ACHIEVEMENTS.filter(a => a.check(achCtx)).map(a => a.id)),
  [achCtx]);

  const filtered = useMemo(() =>
    activeCategory === 'all'
      ? ALL_ACHIEVEMENTS
      : ALL_ACHIEVEMENTS.filter(a => a.category === activeCategory),
  [activeCategory]);

  // Sort: unlocked first
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const ua = unlockedIds.has(a.id) ? 0 : 1;
      const ub = unlockedIds.has(b.id) ? 0 : 1;
      return ua - ub;
    }),
  [filtered, unlockedIds]);

  const totalCount   = ALL_ACHIEVEMENTS.length;
  const unlockedCount = unlockedIds.size;
  const pct = Math.round((unlockedCount / totalCount) * 100);

  if (!profile) return <div className="page auth-loading-wrapper"><div className="auth-init-spinner" /></div>;

  return (
    <div className="ach-page">

      {/* ── Back Header ────────────────────────────────── */}
      <div className="ach-header">
        <button className="ach-back-btn" onClick={() => navigate('/profile')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="ach-header-text">
          <h1 className="ach-page-title">Achievements</h1>
          <p className="ach-page-sub">Your reading milestones</p>
        </div>
      </div>

      {/* ── Profile Summary ─────────────────────────────── */}
      <div className="ach-profile-bar">
        <div className="ach-profile-avatar">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="ach-avatar-img" />
          ) : (
            <div className="ach-avatar-placeholder">
              {(profile.full_name?.[0] || profile.username?.[0] || '?').toUpperCase()}
            </div>
          )}
        </div>
        <div className="ach-profile-info">
          <div className="ach-profile-name">{profile.full_name || profile.username}</div>
          <div className="ach-profile-sub">
            {isAuthor ? 'Author · ' : ''}{daysSinceMember} days as member
          </div>
        </div>
      </div>

      {/* ── Progress Banner ─────────────────────────────── */}
      <div className="ach-progress-banner">
        <div className="ach-progress-top">
          <div className="ach-progress-fraction">
            <span className="ach-progress-unlocked">{unlockedCount}</span>
            <span className="ach-progress-total"> / {totalCount} unlocked</span>
          </div>
          <span className="ach-progress-pct">{pct}%</span>
        </div>
        <div className="ach-progress-track">
          <div className="ach-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ach-progress-stars">
          {Array.from({ length: totalCount }).map((_, i) => (
            <div
              key={i}
              className={`ach-progress-dot ${i < unlockedCount ? 'ach-dot-filled' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* ── Category Filter ─────────────────────────────── */}
      <div className="ach-category-row">
        {CATEGORIES.map((cat) => {
          const catAchs = cat.key === 'all' ? ALL_ACHIEVEMENTS : ALL_ACHIEVEMENTS.filter(a => a.category === cat.key);
          const catUnlocked = catAchs.filter(a => unlockedIds.has(a.id)).length;
          return (
            <button
              key={cat.key}
              className={`ach-cat-pill ${activeCategory === cat.key ? 'ach-cat-active' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="ach-cat-count">{catUnlocked}/{catAchs.length}</span>
            </button>
          );
        })}
      </div>

      {/* ── Achievement Grid ─────────────────────────────── */}
      <div className="ach-grid">
        {sorted.map((ach, i) => (
          <div
            key={ach.id}
            className="ach-grid-item"
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <AchCard
              ach={ach}
              unlocked={unlockedIds.has(ach.id)}
              onTap={() => setSelectedAch(ach)}
            />
          </div>
        ))}
      </div>

      {/* ── Motivational Footer ──────────────────────────── */}
      {unlockedCount < totalCount && (
        <div className="ach-footer">
          <div className="ach-footer-icon">🚀</div>
          <p><strong>{totalCount - unlockedCount} more</strong> achievements to unlock — keep reading!</p>
        </div>
      )}
      {unlockedCount === totalCount && (
        <div className="ach-footer ach-footer-complete">
          <div className="ach-footer-icon">🏆</div>
          <p><strong>All achievements unlocked!</strong> You're a Lehkhabu champion.</p>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────── */}
      {selectedAch && (
        <AchModal
          ach={selectedAch}
          unlocked={unlockedIds.has(selectedAch.id)}
          onClose={() => setSelectedAch(null)}
        />
      )}
    </div>
  );
}
