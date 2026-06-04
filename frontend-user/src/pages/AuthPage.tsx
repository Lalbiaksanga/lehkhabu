import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { signIn, signUp } from '../services/auth.service';
import '../assets/styles/pages/auth.css';
type Mode = 'login' | 'register' | 'forgot';

const SPINES = [
  { h: 95,  color: '#C17817' },
  { h: 115, color: '#4F8EF7' },
  { h: 80,  color: '#34D399' },
  { h: 130, color: '#A78BFA' },
  { h: 70,  color: '#FB923C' },
  { h: 110, color: '#F472B6' },
  { h: 90,  color: '#22D3EE' },
  { h: 120, color: '#E8845A' },
  { h: 75,  color: '#5D8A6C' },
  { h: 105, color: '#6B7DB3' },
  { h: 88,  color: '#C97C3A' },
  { h: 118, color: '#7A9E7E' },
  { h: 72,  color: '#A07A5A' },
  { h: 100, color: '#D45F8A' },
  { h: 85,  color: '#8B7355' },
];

function getStrength(pw: string) {
  if (pw.length === 0) return null;
  if (pw.length < 8) return 'weak';
  if (pw.length >= 12 && /[^a-zA-Z0-9]/.test(pw)) return 'strong';
  return 'fair';
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, initialized } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (initialized && session) navigate('/', { replace: true });
  }, [session, initialized, navigate]);

  const reset = () => {
    setError(null);
    setSuccess(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setUsername('');
    setShowPw(false);
  };

  const switchMode = (m: Mode) => { reset(); setMode(m); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) {
      setError('Username: lowercase letters, numbers, underscores only.');
      return;
    }
    setLoading(true);
    try {
      await signUp({ email, password, fullName, username });
      setSuccess('Account created! Check your email to verify, then sign in.');
      switchMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { resetPassword } = await import('../services/auth.service');
      await resetPassword(email);
      setSuccess('Reset link sent! Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const strength = getStrength(password);

  return (
    <div className="auth-page">
      {/* Soft radial glow */}
      <div className="auth-bg-gradient" />

      {/* Book spines along the bottom */}
      <div className="auth-bg-books">
        {SPINES.map((s, i) => (
          <div
            key={i}
            className="auth-book-spine"
            style={{
              width: 26,
              height: s.h,
              background: `linear-gradient(180deg, ${s.color}dd, ${s.color}66)`,
              animationDelay: `${i * 0.07}s`,
            }}
          />
        ))}
      </div>

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-book">📚</div>
          <div className="auth-logo-wordmark">
            Lehkha<em>bu</em>
          </div>
          <div className="auth-logo-tag">Your Mizo Reading Home</div>
        </div>

        {/* Card */}
        <div className="auth-card">

          {/* Tab switcher */}
          {mode !== 'forgot' && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
                onClick={() => switchMode('register')}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Forgot: back button */}
          {mode === 'forgot' && (
            <button className="auth-back" type="button" onClick={() => switchMode('login')}>
              ← Back to Sign In
            </button>
          )}

          {/* Title */}
          <h2 className="auth-card-title">
            {mode === 'login'    && 'Welcome back 👋'}
            {mode === 'register' && 'Join the community'}
            {mode === 'forgot'   && 'Reset your password'}
          </h2>
          <p className="auth-card-sub">
            {mode === 'login'    && 'Sign in to continue reading'}
            {mode === 'register' && 'Create a free account today'}
            {mode === 'forgot'   && "Enter your email and we'll send a link"}
          </p>

          {/* Alerts */}
          {error && (
            <div className="auth-banner auth-banner-error">
              <span className="auth-banner-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="auth-banner auth-banner-success">
              <span className="auth-banner-icon">✅</span>
              <span>{success}</span>
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <form className="auth-form" onSubmit={handleLogin} autoComplete="on">
              <div className="auth-field">
                <label className="auth-label" htmlFor="li-email">Email</label>
                <input
                  id="li-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label className="auth-label" htmlFor="li-pw">Password</label>
                  <button type="button" className="auth-forgot" onClick={() => switchMode('forgot')}>
                    Forgot password?
                  </button>
                </div>
                <div className="auth-pw-wrap">
                  <input
                    id="li-pw"
                    className="auth-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? <span className="auth-btn-spinner" /> : 'Sign In →'}
              </button>
            </form>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && (
            <form className="auth-form" onSubmit={handleRegister} autoComplete="off">
              <div className="auth-field">
                <label className="auth-label" htmlFor="rg-name">Full Name</label>
                <input
                  id="rg-name"
                  className="auth-input"
                  type="text"
                  placeholder="Your full name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="rg-user">Username</label>
                <div className="auth-at-wrap">
                  <span className="auth-at-prefix">@</span>
                  <input
                    id="rg-user"
                    className="auth-input"
                    type="text"
                    placeholder="your_username"
                    required
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                  />
                </div>
                <span className="auth-hint-txt">Lowercase letters, numbers, underscores only</span>
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="rg-email">Email</label>
                <input
                  id="rg-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="rg-pw">Password</label>
                <div className="auth-pw-wrap">
                  <input
                    id="rg-pw"
                    className="auth-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                {strength && (
                  <div className="auth-strength-row">
                    <div className="auth-strength-track">
                      <div className={`auth-strength-fill auth-strength-${strength}`} />
                    </div>
                    <span className="auth-strength-label">
                      {strength === 'weak' ? '😬 Too short' : strength === 'fair' ? '👍 Good' : '💪 Strong'}
                    </span>
                  </div>
                )}
              </div>

              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? <span className="auth-btn-spinner" /> : 'Create Account →'}
              </button>

              <p className="auth-terms">
                By signing up you agree to our{' '}
                <a href="#">Terms of Service</a> and{' '}
                <a href="#">Privacy Policy</a>.
              </p>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <form className="auth-form" onSubmit={handleForgot}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="fg-email">Email address</label>
                <input
                  id="fg-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? <span className="auth-btn-spinner" /> : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
