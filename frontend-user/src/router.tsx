import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

/* ── Lazy-loaded page components (code-split per route) ─── */
const AuthPage               = lazy(() => import('./pages/AuthPage'));
const HomePage               = lazy(() => import('./pages/HomePage'));
const ExplorePage            = lazy(() => import('./pages/ExplorePage'));
const LibraryPage            = lazy(() => import('./pages/LibraryPage'));
const BookDetailPage         = lazy(() => import('./pages/BookDetailPage'));
const ProfilePage            = lazy(() => import('./pages/ProfilePage'));
const ProfileSettingsPage    = lazy(() => import('./pages/settings/ProfileSettingsPage'));
const AccountSettingsPage    = lazy(() => import('./pages/settings/AccountSettingsPage'));
const PublicProfilePage      = lazy(() => import('./pages/PublicProfilePage'));
const ReaderPage             = lazy(() => import('./pages/ReaderPage'));
const AuthorApplicationPage  = lazy(() => import('./pages/AuthorApplicationPage'));
const AuthorDashboardPage    = lazy(() => import('./pages/AuthorDashboardPage'));
const AchievementsPage       = lazy(() => import('./pages/AchievementsPage'));

/* ── Page-level loading fallback ─── */
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', flexDirection: 'column', gap: 12,
    }}>
      <div className="app-loading-spinner" />
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  // Public auth route
  {
    path: '/auth',
    element: <Lazy><AuthPage /></Lazy>,
    errorElement: <ErrorBoundary />,
  },

  // All main app pages — protected behind login
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { index: true,                       element: <Lazy><HomePage /></Lazy>              },
      { path: 'explore',                   element: <Lazy><ExplorePage /></Lazy>           },
      { path: 'search',                    element: <Lazy><ExplorePage /></Lazy>           },
      { path: 'library',                   element: <Lazy><LibraryPage /></Lazy>           },
      { path: 'book/:id',                  element: <Lazy><BookDetailPage /></Lazy>        },
      { path: 'u/:username',               element: <Lazy><PublicProfilePage /></Lazy>     },
      { path: 'profile',                   element: <Lazy><ProfilePage /></Lazy>           },
      { path: 'profile/settings/profile',  element: <Lazy><ProfileSettingsPage /></Lazy>   },
      { path: 'profile/settings/account',  element: <Lazy><AccountSettingsPage /></Lazy>   },
      { path: 'apply',                     element: <Lazy><AuthorApplicationPage /></Lazy> },
      { path: 'author',                    element: <Lazy><AuthorDashboardPage /></Lazy>   },
      { path: 'achievements',              element: <Lazy><AchievementsPage /></Lazy>      },
    ],
  },

  // ReaderPage is standalone — full-screen, no AppLayout chrome, still protected
  {
    path: '/read/:id',
    element: (
      <ProtectedRoute>
        <Lazy><ReaderPage /></Lazy>
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
  },
]);
