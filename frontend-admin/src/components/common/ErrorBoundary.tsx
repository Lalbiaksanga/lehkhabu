import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export default function ErrorBoundary() {
  const error = useRouteError();
  console.error("Admin Route Error:", error);

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred in the admin dashboard.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page Not Found';
      message = 'The requested admin page does not exist.';
    } else if (error.status === 401 || error.status === 403) {
      title = 'Unauthorized';
      message = 'You do not have permission to access this area.';
    } else {
      title = `Error ${error.status}`;
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', height: '100vh', padding: 'var(--space-xl, 24px)', 
      textAlign: 'center', backgroundColor: 'var(--bg-app, #fafafa)', color: 'var(--text-primary, #111827)'
    }}>
      <div style={{ marginBottom: 'var(--space-lg, 16px)', color: 'var(--color-red, #ef4444)' }}>
        <AlertCircle size={64} />
      </div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 'var(--space-sm, 8px)' }}>
        {title}
      </h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #4b5563)', marginBottom: 'var(--space-xl, 32px)', maxWidth: 400, lineHeight: 1.6 }}>
        {message}
      </p>
      <Link to="/" className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '6px', background: 'var(--color-blue, #3b82f6)', color: '#fff', textDecoration: 'none' }}>
        Go to Dashboard
      </Link>
    </div>
  );
}
