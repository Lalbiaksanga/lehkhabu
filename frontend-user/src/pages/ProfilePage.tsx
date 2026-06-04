import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useBooksStore } from '../store/booksStore';
import { signOut } from '../services/auth.service';
import { fetchMyApplication } from '../services/author.service';
import { useState, useEffect, useMemo } from 'react';
import '../assets/styles/pages/ProfilePage.css';
/* ── Achievement definitions (module-level, never re-created) ── */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  bgGradient: string;
  category: 'reading' | 'social' | 'author' | 'streak' | 'explorer';
  check: (ctx: AchievementContext) => boolean;
}

export interface AchievementContext {
  readCount: number;
  readingCount: number;
  wantCount: number;
  purchaseCount: number;
  isAuthor: boolean;
  daysSinceMember: number;
  totalShelf: number;
  categories: Set<string>;
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'early_adopter', title: 'Early Adopter', description: 'One of the first members of Lehkhabu',
    icon: '🌟', color: '#F59E0B', bgGradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
    category: 'streak', check: () => true,
  },
  {
    id: 'first_book', title: 'First Chapter', description: 'Added your first book to the shelf',
    icon: '📗', color: '#10B981', bgGradient: 'linear-gradient(135deg, #10B981, #059669)',
    category: 'reading', check: (c) => c.totalShelf >= 1,
  },
  {
    id: 'bookworm', title: 'Bookworm', description: 'Read 3 books cover to cover',
    icon: '🐛', color: '#8B5CF6', bgGradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    category: 'reading', check: (c) => c.readCount >= 3,
  },
  {
    id: 'avid_reader', title: 'Avid Reader', description: 'Completed reading 10 books',
    icon: '📚', color: '#EC4899', bgGradient: 'linear-gradient(135deg, #EC4899, #DB2777)',
    category: 'reading', check: (c) => c.readCount >= 10,
  },
  {
    id: 'collector', title: 'Collector', description: 'Added 5 books to your Want to Read list',
    icon: '🔖', color: '#3B82F6', bgGradient: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    category: 'reading', check: (c) => c.wantCount >= 5,
  },
  {
    id: 'genre_explorer', title: 'Genre Explorer', description: 'Explored books across 3+ different categories',
    icon: '🗺️', color: '#F97316', bgGradient: 'linear-gradient(135deg, #F97316, #EA580C)',
    category: 'explorer', check: (c) => c.categories.size >= 3,
  },
  {
    id: 'purchaser', title: 'Supporter', description: 'Purchased your first book to support an author',
    icon: '🛍️', color: '#14B8A6', bgGradient: 'linear-gradient(135deg, #14B8A6, #0D9488)',
    category: 'social', check: (c) => c.purchaseCount >= 1,
  },
  {
    id: 'author', title: 'Author', description: 'Became a verified Lehkhabu author',
    icon: '✍️', color: '#6366F1', bgGradient: 'linear-gradient(135deg, #6366F1, #4F46E5)',
    category: 'author', check: (c) => c.isAuthor,
  },
  {
    id: 'veteran', title: 'Veteran', description: 'Been a member for 30+ days',
    icon: '🏅', color: '#EF4444', bgGradient: 'linear-gradient(135deg, #EF4444, #DC2626)',
    category: 'streak', check: (c) => c.daysSinceMember >= 30,
  },
  {
    id: 'shelf_master', title: 'Shelf Master', description: 'Have 20+ books across all shelves',
    icon: '🏆', color: '#FBBF24', bgGradient: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
    category: 'reading', check: (c) => c.totalShelf >= 20,
  },
  {
    id: 'multitasker', title: 'Multitasker', description: 'Currently reading 3 or more books simultaneously',
    icon: '🎯', color: '#A855F7', bgGradient: 'linear-gradient(135deg, #A855F7, #9333EA)',
    category: 'reading', check: (c) => c.readingCount >= 3,
  },
  {
    id: 'dedicated', title: 'Dedicated', description: 'Been a member for 90+ days',
    icon: '💎', color: '#06B6D4', bgGradient: 'linear-gradient(135deg, #06B6D4, #0891B2)',
    category: 'streak', check: (c) => c.daysSinceMember >= 90,
  },
];

/* ── Small stat card (reusable) ── */
function StatPill({ value, label, onClick }: { value: number | string; label: string; onClick?: () => void }) {
  return (
    <button className={`pp-stat-pill ${onClick ? 'pp-stat-clickable' : ''}`} onClick={onClick}>
      <span className="pp-stat-value">{value}</span>
      <span className="pp-stat-label">{label}</span>
    </button>
  );
}

/* ── Menu row ── */
function MenuRow({
  icon, title, subtitle, accent, onClick,
}: { icon: string; title: string; subtitle?: string; accent?: string; onClick?: () => void }) {
  return (
    <button className="pp-menu-row" onClick={onClick} style={accent ? { '--row-accent': accent } as React.CSSProperties : undefined}>
      <div className="pp-menu-icon" style={accent ? { background: `${accent}18`, color: accent } : undefined}>
        {icon}
      </div>
      <div className="pp-menu-text">
        <span className="pp-menu-title">{title}</span>
        {subtitle && <span className="pp-menu-sub">{subtitle}</span>}
      </div>
      <svg className="pp-menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

/* ── Tiny hexagon achievement badge ── */
function MiniHexBadge({ ach, unlocked }: { ach: Achievement; unlocked: boolean }) {
  return (
    <div
      className={`pp-hex-badge ${unlocked ? 'pp-hex-unlocked' : 'pp-hex-locked'}`}
      title={ach.title}
      style={unlocked ? { '--badge-grad': ach.bgGradient } as React.CSSProperties : undefined}
    >
      <div className="pp-hex-inner">
        {unlocked ? (
          <span className="pp-hex-icon">{ach.icon}</span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { shelf, purchases, shelfLoading } = useBooksStore();

  const isAuthor = profile?.role === 'AUTHOR' || profile?.role === 'ADMIN';
  const [applicationStatus, setApplicationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch author application status for non-authors
  useEffect(() => {
    if (!profile?.id || isAuthor) return;
    fetchMyApplication(profile.id).then((app) => {
      if (!app) return;
      const s = app.status.toLowerCase() as 'pending' | 'approved' | 'rejected';
      setApplicationStatus(s);
    }).catch(() => {});
  }, [profile?.id, isAuthor]);

  // Derived stats
  const readCount    = useMemo(() => shelf.filter((s) => s.shelf === 'READ').length, [shelf]);
  const readingCount = useMemo(() => shelf.filter((s) => s.shelf === 'READING').length, [shelf]);
  const wantCount    = useMemo(() => shelf.filter((s) => s.shelf === 'WANT_TO_READ').length, [shelf]);
  const totalShelf   = shelf.length;
  const purchaseCount = purchases.length;

  // Days since member
  const daysSinceMember = useMemo(() => {
    if (!profile?.created_at) return 0;
    return Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
  }, [profile?.created_at]);

  // Categories explored (from shelf books)
  const categoriesExplored = useMemo(() => {
    const cats = new Set<string>();
    shelf.forEach((entry) => {
      const book = (entry as unknown as { book?: { category?: string } | null }).book;
      if (book?.category) cats.add(book.category);
    });
    return cats;
  }, [shelf]);

  // Achievement evaluation
  const achCtx: AchievementContext = useMemo(() => ({
    readCount, readingCount, wantCount, purchaseCount,
    isAuthor, daysSinceMember, totalShelf, categories: categoriesExplored,
  }), [readCount, readingCount, wantCount, purchaseCount, isAuthor, daysSinceMember, totalShelf, categoriesExplored]);

  const unlockedAchs = useMemo(() =>
    ALL_ACHIEVEMENTS.filter((a) => a.check(achCtx)), [achCtx]);
  const lockedAchs   = useMemo(() =>
    ALL_ACHIEVEMENTS.filter((a) => !a.check(achCtx)), [achCtx]);

  // Reading goal progress
  const readingGoal = 12;
  const daysLeft = Math.ceil(
    (new Date(new Date().getFullYear(), 11, 31).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const goalPct = Math.min(100, Math.round((readCount / readingGoal) * 100));

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); } catch (_) {}
    finally {
      useAuthStore.getState().clearAuth();
      window.location.href = '/auth';
    }
  };

  const handleShare = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${profile.full_name || profile.username} on Lehkhabu`, url }); } catch (_) {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!profile) {
    return (
      <div className="page auth-loading-wrapper">
        <div className="auth-init-spinner" />
      </div>
    );
  }

  const memberYear = new Date(profile.created_at).getFullYear();
  const joinedLabel = new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  return (
    <div className="pp-page">

      {/* ═══ HERO HEADER ═══ */}
      <div className="pp-hero">
        {/* Background */}
        <div
          className="pp-hero-bg"
          style={profile.profile_bg_url ? {
            backgroundImage: `url(${profile.profile_bg_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
          } : undefined}
        >
          {!profile.profile_bg_url && (
            <>
              <div className="pp-blob pp-blob-1" />
              <div className="pp-blob pp-blob-2" />
              <div className="pp-blob pp-blob-3" />
            </>
          )}
          <div className="pp-hero-overlay" />
        </div>

        {/* Actions row */}
        <div className="pp-hero-actions">
          <button className="pp-icon-btn" onClick={handleShare} aria-label="Share profile">
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
          </button>
        </div>

        {/* Avatar + identity */}
        <div className="pp-hero-identity">
          <div className="pp-avatar-ring">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="pp-avatar-img" />
            ) : (
              <div className="pp-avatar-placeholder">
                {(profile.full_name?.[0] || profile.username?.[0] || '?').toUpperCase()}
              </div>
            )}
            {isAuthor && <div className="pp-author-badge">✍️</div>}
          </div>
          <div className="pp-identity-text">
            <h1 className="pp-name">{profile.full_name || profile.username}</h1>
            <div className="pp-handle">@{profile.username}</div>
            {isAuthor && <div className="pp-role-chip">Author</div>}
          </div>
        </div>

        {/* Bio */}
        {profile.bio && <p className="pp-bio">{profile.bio}</p>}

        {/* Quick stats row */}
        <div className="pp-quick-stats">
          <StatPill value={readCount}    label="Read"     onClick={() => navigate('/library')} />
          <div className="pp-stats-divider" />
          <StatPill value={readingCount} label="Reading"  onClick={() => navigate('/library')} />
          <div className="pp-stats-divider" />
          <StatPill value={wantCount}    label="Wishlist"  onClick={() => navigate('/library')} />
          <div className="pp-stats-divider" />
          <StatPill value={unlockedAchs.length} label="Badges" onClick={() => navigate('/achievements')} />
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="pp-body">

        {/* ── Author Section (only for authors/admins) ─────────── */}
        {isAuthor && (
          <section className="pp-section pp-section-author">
            <button className="pp-author-card" onClick={() => navigate('/author')}>
              <div className="pp-author-card-glow" />
              <div className="pp-author-card-content">
                <div className="pp-author-card-icon">
                  <span>✍️</span>
                </div>
                <div className="pp-author-card-text">
                  <h3>Author Dashboard</h3>
                  <p>Manage books · track earnings · publish new stories</p>
                </div>
                <svg className="pp-author-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </section>
        )}

        {/* ── Reading Goals ───────────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-section-header">
            <span className="pp-section-title">Reading Goals</span>
            <button className="pp-section-link" onClick={() => navigate('/library')}>
              Library →
            </button>
          </div>
          <div className="pp-goals-card">

            {/* ── Arc gauge ── */}
            <div className="pp-arc-wrap">
              <svg className="pp-arc-svg" viewBox="0 0 200 110" fill="none">
                {/* Track */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  stroke="#EDE9E3" strokeWidth="13" strokeLinecap="round"
                />
                {/* Fill — arc length of a 80px semicircle = π*80 ≈ 251.2 */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  stroke="url(#arcGrad)" strokeWidth="13" strokeLinecap="round"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * Math.min(goalPct, 100)) / 100}
                  style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
                />
                <defs>
                  <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#C17817" />
                    <stop offset="100%" stopColor="#F5A623" />
                  </linearGradient>
                </defs>
                {/* Center content */}
                <text x="100" y="74" textAnchor="middle" fontSize="28" fontWeight="800" fill="#1A1A1A" fontFamily="Outfit,sans-serif">
                  {readCount}
                </text>
                <text x="100" y="92" textAnchor="middle" fontSize="11" fill="#8B8B8B" fontFamily="Inter,sans-serif">
                  of {readingGoal} books
                </text>
              </svg>
              <div className="pp-arc-label">
                <span className="pp-arc-goal-txt">{new Date().getFullYear()} Reading Goal</span>
                <span className="pp-arc-days">{daysLeft} days left</span>
              </div>
            </div>

            {/* ── Currently reading prompt ── */}
            {readingCount > 0 && (
              <button className="pp-keep-reading" onClick={() => navigate('/library')}>
                <span className="pp-keep-reading-label">Keep Reading</span>
                <span className="pp-keep-reading-sub">{readingCount} book{readingCount > 1 ? 's' : ''} in progress</span>
              </button>
            )}

            {/* ── Weekly streak dots (S M T W T F S) ── */}
            <div className="pp-streak-row">
              {['S','M','T','W','T','F','S'].map((d, i) => {
                const today = new Date().getDay(); // 0=Sun
                const isToday = i === today;
                const isYesterday = daysSinceMember >= 1 && i === (today - 1 + 7) % 7;
                const active = isToday || isYesterday;
                return (
                  <div key={i} className={`pp-streak-dot ${active ? 'pp-streak-active' : ''} ${isToday ? 'pp-streak-today' : ''}`}>
                    {d}
                  </div>
                );
              })}
            </div>
            <div className="pp-streak-label">
              Your reading streak is <strong>{Math.min(daysSinceMember, 7)} day{daysSinceMember !== 1 ? 's' : ''}</strong>
              {daysSinceMember >= 7 && <span className="pp-streak-record"> · New Record 🔥</span>}
            </div>

            {goalPct >= 100 && (
              <div className="pp-challenge-congrats">🎉 Goal achieved! You're a reading champion.</div>
            )}
          </div>
        </section>


        {/* ── Achievements Preview ──────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-section-header">
            <span className="pp-section-title">Achievements</span>
            <button className="pp-section-link" onClick={() => navigate('/achievements')}>
              View all →
            </button>
          </div>
          <div className="pp-achievements-strip">
            {shelfLoading ? (
              <div className="pp-ach-loading">Loading…</div>
            ) : (
              <>
                {ALL_ACHIEVEMENTS.slice(0, 8).map((ach) => (
                  <MiniHexBadge key={ach.id} ach={ach} unlocked={achCtx && ach.check(achCtx)} />
                ))}
              </>
            )}
          </div>
          <div className="pp-ach-summary">
            <span>{unlockedAchs.length} unlocked</span>
            <span>·</span>
            <span>{lockedAchs.length} remaining</span>
          </div>
        </section>

        {/* ── Apply / Application Status (non-authors) ─────────── */}
        {!isAuthor && (
          <section className="pp-section">
            {applicationStatus === 'pending' ? (
              <button className="pp-apply-card pp-apply-pending" onClick={() => navigate('/apply')}>
                <span className="pp-apply-icon">⏳</span>
                <div className="pp-apply-text">
                  <strong>Application Under Review</strong>
                  <span>Our team is reviewing your submission</span>
                </div>
                <svg className="pp-menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : applicationStatus === 'rejected' ? (
              <button className="pp-apply-card pp-apply-rejected" onClick={() => navigate('/apply')}>
                <span className="pp-apply-icon">❌</span>
                <div className="pp-apply-text">
                  <strong>Application Not Approved</strong>
                  <span>Tap to revise and reapply</span>
                </div>
                <svg className="pp-menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <button className="pp-apply-card pp-apply-cta" onClick={() => navigate('/apply')}>
                <span className="pp-apply-icon">🌟</span>
                <div className="pp-apply-text">
                  <strong>Become an Author</strong>
                  <span>Share your stories with the Mizo reading community</span>
                </div>
                <svg className="pp-menu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </section>
        )}

        {/* ── My Stats Breakdown ─────────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-section-header">
            <span className="pp-section-title">My Stats</span>
          </div>
          <div className="pp-stats-grid">
            <div className="pp-stats-tile pp-tile-read">
              <div className="pp-tile-num">{readCount}</div>
              <div className="pp-tile-lbl">Books Read</div>
            </div>
            <div className="pp-stats-tile pp-tile-reading">
              <div className="pp-tile-num">{readingCount}</div>
              <div className="pp-tile-lbl">Currently Reading</div>
            </div>
            <div className="pp-stats-tile pp-tile-want">
              <div className="pp-tile-num">{wantCount}</div>
              <div className="pp-tile-lbl">Wish List</div>
            </div>
            <div className="pp-stats-tile pp-tile-purchased">
              <div className="pp-tile-num">{purchaseCount}</div>
              <div className="pp-tile-lbl">Purchased</div>
            </div>
            <div className="pp-stats-tile pp-tile-genres">
              <div className="pp-tile-num">{categoriesExplored.size}</div>
              <div className="pp-tile-lbl">Genres Explored</div>
            </div>
            <div className="pp-stats-tile pp-tile-days">
              <div className="pp-tile-num">{daysSinceMember}</div>
              <div className="pp-tile-lbl">Days as Member</div>
            </div>
          </div>
        </section>

        {/* ── Account & Settings ─────────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-section-header">
            <span className="pp-section-title">Settings</span>
          </div>
          <div className="pp-menu-card">
            <MenuRow
              icon="👤" title="Profile Settings" subtitle="Name, bio, avatar, cover photo"
              accent="#3B82F6"
              onClick={() => navigate('/profile/settings/profile')}
            />
            <MenuRow
              icon="🔒" title="Account & Security" subtitle="Email, username, password"
              accent="#10B981"
              onClick={() => navigate('/profile/settings/account')}
            />
            <MenuRow
              icon="🏆" title="Achievements" subtitle={`${unlockedAchs.length} of ${ALL_ACHIEVEMENTS.length} unlocked`}
              accent="#F59E0B"
              onClick={() => navigate('/achievements')}
            />
            <MenuRow
              icon="📤" title="Share My Profile" subtitle={`lehkhabu.com/u/${profile.username}`}
              accent="#8B5CF6"
              onClick={handleShare}
            />
          </div>
        </section>

        {/* ── Account Info ───────────────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-info-card">
            <div className="pp-info-row">
              <span className="pp-info-label">Email</span>
              <span className="pp-info-value">{profile.email}</span>
            </div>
            <div className="pp-info-divider" />
            <div className="pp-info-row">
              <span className="pp-info-label">Member since</span>
              <span className="pp-info-value">{joinedLabel}</span>
            </div>
            <div className="pp-info-divider" />
            <div className="pp-info-row">
              <span className="pp-info-label">Role</span>
              <span className="pp-info-value pp-role-badge" data-role={profile.role}>{profile.role}</span>
            </div>
            {memberYear <= new Date().getFullYear() && (
              <>
                <div className="pp-info-divider" />
                <div className="pp-info-row">
                  <span className="pp-info-label">Member year</span>
                  <span className="pp-info-value">{memberYear}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Social Links ───────────────────────────────────────── */}
        {profile.social_links && Object.values(profile.social_links).some(Boolean) && (
          <section className="pp-section">
            <div className="pp-section-header">
              <span className="pp-section-title">Social</span>
            </div>
            <div className="pp-social-links">
              {profile.social_links?.twitter && (
                <a
                  href={`https://twitter.com/${profile.social_links.twitter.replace('@', '')}`}
                  target="_blank" rel="noreferrer"
                  className="pp-social-chip"
                >
                  𝕏 {profile.social_links.twitter}
                </a>
              )}
              {profile.social_links?.instagram && (
                <a
                  href={`https://instagram.com/${profile.social_links.instagram.replace('@', '')}`}
                  target="_blank" rel="noreferrer"
                  className="pp-social-chip"
                >
                  📸 {profile.social_links.instagram}
                </a>
              )}
              {profile.social_links?.website && (
                <a href={profile.social_links.website} target="_blank" rel="noreferrer" className="pp-social-chip">
                  🌐 Website
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── Sign Out ───────────────────────────────────────────── */}
        <section className="pp-section pp-section-signout">
          <button className="pp-signout-btn" onClick={handleSignOut} disabled={signingOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
          <p className="pp-version">Lehkhabu v1.0 · Made with ❤️ for Mizo readers</p>
        </section>

      </div>
    </div>
  );
}
