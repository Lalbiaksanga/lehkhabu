import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

export default function ErrorBoundary() {
  const error = useRouteError();
  console.error("Route Error:", error);

  let title = 'Oops! Something went wrong.';
  let message = 'An unexpected error occurred. Please try again later.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page Not Found';
      message = 'The page you are looking for does not exist or has been moved.';
    } else if (error.status === 401) {
      title = 'Unauthorized';
      message = 'You are not authorized to view this page. Please log in.';
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
      justifyContent: 'center', height: '100vh', padding: '24px', 
      textAlign: 'center', backgroundColor: '#fdfbf9', color: '#111827',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ marginBottom: '24px', color: '#e06b51' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
        {title}
      </h1>
      <p style={{ fontSize: '16px', color: '#4b5563', marginBottom: '32px', maxWidth: '400px', lineHeight: '1.5' }}>
        {message}
      </p>
      <Link to="/" style={{
        padding: '12px 24px', backgroundColor: '#e06b51', color: '#fff',
        borderRadius: '8px', textDecoration: 'none', fontWeight: '500',
        transition: 'background-color 0.2s'
      }}>
        Go to Homepage
      </Link>
    </div>
  );
}
