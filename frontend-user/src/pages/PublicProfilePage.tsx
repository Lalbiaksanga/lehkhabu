import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { ALL_ACHIEVEMENTS, type AchievementContext } from './ProfilePage';
import '../assets/styles/pages/ProfilePage.css';
import '../assets/styles/pages/AchievementsPage.css';

interface PublicProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  profile_bg_url: string | null;
  bio: string | null;
  role: string;
  social_links: Record<string, string> | null;
  is_public_library: boolean;
  created_at: string;
  followers_count: number;
  following_count: number;
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { profile: currentUserProfile } = useAuthStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ read: 0, reading: 0, want: 0, total: 0, purchases: 0 });
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!profile) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${profile.full_name || profile.username}'s Lehkhabu Profile`, url }); } catch (_) {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    async function loadProfile() {
      if (!username) return;
      setLoading(true);
      try {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, username, full_name, avatar_url, profile_bg_url, bio, role, social_links, is_public_library, created_at, followers_count, following_count')
          .eq('username', username)
          .single();

        if (userError || !user) throw new Error('User not found.');
        setProfile(user);

        // Always fetch basic stats for achievements
        const { data: shelfData } = await supabase
          .from('shelf_entries')
          .select('shelf, books(category)')
          .eq('user_id', user.id);

        const { data: purchaseData } = await supabase
          .from('purchases')
          .select('book_id')
          .eq('user_id', user.id);

        if (shelfData) {
          const cats = new Set<string>();
          shelfData.forEach((entry: { shelf: string; books?: Array<{ category?: string }> | null }) => {
            const book = Array.isArray(entry.books) ? entry.books[0] : entry.books;
            if (book?.category) cats.add(book.category);
          });
          setCategories(cats);
          setStats({
            read:      shelfData.filter((s) => s.shelf === 'READ').length,
            reading:   shelfData.filter((s) => s.shelf === 'READING').length,
            want:      shelfData.filter((s) => s.shelf === 'WANT_TO_READ').length,
            total:     shelfData.length,
            purchases: purchaseData?.length ?? 0,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load profile');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [username]);

  const daysSinceMember = useMemo(() => {
    if (!profile?.created_at) return 0;
    return Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
  }, [profile?.created_at]);

  const achCtx: AchievementContext = useMemo(() => ({
    readCount: stats.read, readingCount: stats.reading, wantCount: stats.want,
    purchaseCount: stats.purchases,
    isAuthor: profile?.role === 'AUTHOR' || profile?.role === 'ADMIN',
    daysSinceMember, totalShelf: stats.total, categories,
  }), [stats, profile?.role, daysSinceMember, categories]);

  const unlockedAchs = useMemo(() =>
    ALL_ACHIEVEMENTS.filter(a => a.check(achCtx)), [achCtx]);

  if (loading) return <div className="page auth-loading-wrapper"><div className="auth-init-spinner" /></div>;

  if (error || !profile) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '100px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
        <h2>Profile Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{error || 'The user you are looking for does not exist.'}</p>
        <button className="settings-save-btn" onClick={() => navigate(-1)} style={{ marginTop: '24px' }}>Go Back</button>
      </div>
    );
  }

  const isSelf = currentUserProfile?.username === profile.username;
  const isAuthor = profile.role === 'AUTHOR' || profile.role === 'ADMIN';
  const joinedLabel = new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="pp-page">

      {/* ═══ HERO ═══ */}
      <div className="pp-hero">
        <div
          className="pp-hero-bg"
          style={profile.profile_bg_url ? {
            backgroundImage: `url(${profile.profile_bg_url})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
          } : undefined}
        >
          {!profile.profile_bg_url && (
            <>
              <div className="pp-blob pp-blob-1" />
              <div className="pp-blob pp-blob-2" />
            </>
          )}
          <div className="pp-hero-overlay" />
        </div>

        <div className="pp-hero-actions">
          <button className="pp-icon-btn" onClick={handleShare} aria-label="Share">
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
          {isSelf && (
            <button className="pp-icon-btn" onClick={() => navigate('/profile/settings/profile')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>

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

        {profile.bio && <p className="pp-bio">{profile.bio}</p>}

        {/* Quick stats */}
        <div className="pp-quick-stats">
          {profile.is_public_library ? (
            <>
              <div className="pp-stat-pill">
                <span className="pp-stat-value">{stats.read}</span>
                <span className="pp-stat-label">Read</span>
              </div>
              <div className="pp-stats-divider" />
              <div className="pp-stat-pill">
                <span className="pp-stat-value">{stats.reading}</span>
                <span className="pp-stat-label">Reading</span>
              </div>
              <div className="pp-stats-divider" />
              <div className="pp-stat-pill">
                <span className="pp-stat-value">{stats.want}</span>
                <span className="pp-stat-label">Wishlist</span>
              </div>
              <div className="pp-stats-divider" />
            </>
          ) : null}
          <div className="pp-stat-pill">
            <span className="pp-stat-value">{unlockedAchs.length}</span>
            <span className="pp-stat-label">Badges</span>
          </div>
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="pp-body">

        {/* ── Achievements (public showcase) ────────────── */}
        {unlockedAchs.length > 0 && (
          <section className="pp-section">
            <div className="pp-section-header">
              <span className="pp-section-title">🏆 Achievements</span>
              <span className="pp-section-badge">{unlockedAchs.length} unlocked</span>
            </div>
            <div className="pub-badges-grid">
              {unlockedAchs.map((ach) => (
                <div key={ach.id} className="pub-badge-item" title={ach.title}>
                  <div
                    className="pub-badge-hex"
                    style={{ '--hex-grad': ach.bgGradient } as React.CSSProperties}
                  >
                    <span>{ach.icon}</span>
                  </div>
                  <span className="pub-badge-label">{ach.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Library (if public) ───────────────────────── */}
        {profile.is_public_library ? (
          <section className="pp-section">
            <div className="pp-section-header">
              <span className="pp-section-title">📚 Library</span>
            </div>
            <div className="pp-stats-grid">
              {[
                { val: stats.read,    lbl: 'Books Read',    cls: 'pp-tile-read' },
                { val: stats.reading, lbl: 'Reading',       cls: 'pp-tile-reading' },
                { val: stats.want,    lbl: 'Wish List',     cls: 'pp-tile-want' },
                { val: categories.size, lbl: 'Genres',      cls: 'pp-tile-genres' },
                { val: stats.purchases, lbl: 'Purchased',   cls: 'pp-tile-purchased' },
                { val: daysSinceMember,  lbl: 'Days Active', cls: 'pp-tile-days' },
              ].map(({ val, lbl, cls }) => (
                <div key={lbl} className={`pp-stats-tile ${cls}`}>
                  <div className="pp-tile-num">{val}</div>
                  <div className="pp-tile-lbl">{lbl}</div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="pp-section">
            <div className="pp-info-card">
              <div className="pp-info-row" style={{ justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.4rem' }}>🔒</span>
                <span className="pp-info-value" style={{ textAlign: 'center' }}>
                  {profile.username}'s library is private
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Social Links ──────────────────────────────── */}
        {profile.social_links && Object.values(profile.social_links).some(Boolean) && (
          <section className="pp-section">
            <div className="pp-social-links">
              {profile.social_links?.twitter && (
                <a href={`https://twitter.com/${profile.social_links.twitter.replace('@','')}`}
                  target="_blank" rel="noreferrer" className="pp-social-chip">
                  𝕏 {profile.social_links.twitter}
                </a>
              )}
              {profile.social_links?.instagram && (
                <a href={`https://instagram.com/${profile.social_links.instagram.replace('@','')}`}
                  target="_blank" rel="noreferrer" className="pp-social-chip">
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

        {/* ── Account info ──────────────────────────────── */}
        <section className="pp-section">
          <div className="pp-info-card">
            <div className="pp-info-row">
              <span className="pp-info-label">Member since</span>
              <span className="pp-info-value">{joinedLabel}</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
