import { createBrowserRouter } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import AdminLoginPage from '../features/auth/components/AdminLoginPage';
import DashboardPage from '../features/analytics/DashboardPage';
import BooksPage from '../features/books/BooksPage';
import AuthorsPage from '../features/books/AuthorsPage';
import UsersPage from '../features/users/UsersPage';
import ApplicationsPage from '../features/users/ApplicationsPage';
import OrdersPage from '../features/analytics/OrdersPage';
import AnalyticsPage from '../features/analytics/AnalyticsPage';
import AnnouncementsPage from '../features/analytics/AnnouncementsPage';
import UISettingsPage from '../features/analytics/UISettingsPage';
import SettingsPage from '../features/analytics/SettingsPage';
import AdminAccountsPage from '../features/analytics/AdminAccountsPage';
import ErrorBoundary from '../components/common/ErrorBoundary';

export const router = createBrowserRouter([
  // Standalone admin login — no layout wrapper
  { 
    path: '/login', 
    element: <AdminLoginPage />,
    errorElement: <ErrorBoundary />
  },

  {
    path: '/',
    element: <AdminLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true,              element: <DashboardPage /> },
      { path: 'books',            element: <BooksPage /> },
      { path: 'authors',          element: <AuthorsPage /> },
      { path: 'users',            element: <UsersPage /> },
      { path: 'applications',     element: <ApplicationsPage /> },
      { path: 'orders',           element: <OrdersPage /> },
      { path: 'analytics',        element: <AnalyticsPage /> },
      { path: 'announcements',    element: <AnnouncementsPage /> },
      { path: 'settings',         element: <SettingsPage /> },
      { path: 'admins',           element: <AdminAccountsPage /> },
    ],
  },
]);

