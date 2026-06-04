import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { BookOpen, Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // If already logged in as admin, go straight to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data } = await supabase
          .from('admin_accounts')
          .select('role')
          .eq('id', session.user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (data && ['super_admin', 'admin', 'readonly_admin'].includes(data.role ?? '')) {
          navigate('/', { replace: true }); return;
        }
      }
      setChecking(false);
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Sign in with Supabase
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authErr) throw new Error('Invalid email or password.');

      // Verify this user has active admin role in admin_accounts
      const { data: adminRow } = await supabase
        .from('admin_accounts')
        .select('role')
        .eq('id', authData.user!.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!adminRow || !['super_admin', 'admin', 'readonly_admin'].includes(adminRow.role ?? '')) {
        await supabase.auth.signOut();
        throw new Error('Access denied. This account does not have admin privileges.');
      }
      
      try { await supabase.rpc('record_admin_login'); } catch (_) { /* non-critical */ }

      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f0f13' }}>
        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Checking session…</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f13 0%, #1a1a24 50%, #0f0f13 100%)',
      fontFamily: 'var(--font-body, Inter, sans-serif)',
    }}>
      {/* Glow backdrop */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(193,120,23,0.12) 0%, transparent 70%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 420, padding: '0 20px',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #C17817, #8B4513)',
            marginBottom: 16, boxShadow: '0 0 32px rgba(193,120,23,0.4)',
          }}>
            <BookOpen size={26} color="#fff" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.5px' }}>
            Lehkhabu
          </div>
          <div style={{
            display: 'inline-block', marginTop: 6,
            fontSize: '0.72rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase',
            color: '#C17817', background: 'rgba(193,120,23,0.12)',
            padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(193,120,23,0.3)',
          }}>
            Admin Portal
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
          padding: '36px 32px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f9fafb', margin: '0 0 6px 0' }}>
            Sign in to Dashboard
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 28px 0' }}>
            Use your admin credentials to continue.
          </p>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <AlertCircle size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: '0.84rem', color: '#f87171', lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: 6, fontWeight: 500 }}>
                Admin Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: '#4b5563', pointerEvents: 'none',
                }} />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    paddingLeft: 36, paddingRight: 14, paddingTop: 11, paddingBottom: 11,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, color: '#f9fafb', fontSize: '0.9rem', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(193,120,23,0.6)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: 6, fontWeight: 500 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: '#4b5563', pointerEvents: 'none',
                }} />
                <input
                  id="admin-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    paddingLeft: 36, paddingRight: 42, paddingTop: 11, paddingBottom: 11,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, color: '#f9fafb', fontSize: '0.9rem', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(193,120,23,0.6)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 0,
                    display: 'flex', alignItems: 'center',
                  }}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="admin-login-btn"
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: '12px 20px', borderRadius: 10, border: 'none',
                background: loading
                  ? 'rgba(193,120,23,0.5)'
                  : 'linear-gradient(135deg, #C17817, #a06414)',
                color: '#fff', fontSize: '0.9rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s, transform 0.1s',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(193,120,23,0.4)',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div style={{
            marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: '0.76rem', color: '#4b5563', textAlign: 'center', lineHeight: 1.6,
          }}>
            🔒 Admin access is managed by database only.<br />
            Contact your Supabase administrator to request access.
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: '#374151', fontSize: '0.75rem' }}>
          Lehkhabu Admin Portal · Restricted Access
        </div>
      </div>
    </div>
  );
}
