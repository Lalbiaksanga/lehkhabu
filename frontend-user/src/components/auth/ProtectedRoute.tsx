import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface Props {
  children: React.ReactNode;
}

/**
 * Wraps routes that require authentication.
 * Shows a loading screen while Supabase initializes, then redirects
 * unauthenticated users to /auth.
 */
export default function ProtectedRoute({ children }: Props) {
  const { session, initialized } = useAuthStore();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="auth-init-screen">
        <div className="auth-init-logo">
          📚 <span>Lehkha<span style={{ color: 'var(--color-amber)' }}>bu</span></span>
        </div>
        <div className="auth-init-spinner" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
