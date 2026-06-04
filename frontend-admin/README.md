# Lehkhabu — Admin Portal

Admin dashboard for managing the Lehkhabu book marketplace. Built with React, TypeScript, and Vite.

## Features

- **Dashboard** — Real-time stats (total books, users, revenue, pending actions)
- **Book Management** — Review, approve/reject, and manage all submitted books
- **User Management** — View users, manage roles, promote to author
- **Author Applications** — Review and approve author applications
- **Orders & Revenue** — Track purchases and revenue analytics
- **Announcements** — Create and manage platform announcements
- **Analytics** — Detailed platform analytics and charts
- **Admin Accounts** — Manage admin team members
- **UI Settings** — Customize platform appearance

## Tech Stack

- React 19 + TypeScript
- Vite (dev server + build)
- Supabase (auth, database, storage)
- Zustand (state management)
- Lucide React (icons)
- Recharts (analytics charts)

## Setup

```bash
npm install
npm run dev       # http://localhost:5174
```

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env` file.

## Project Structure

```
src/
├── app/           Router configuration
├── components/    Shared layout (AdminLayout) and ErrorBoundary
├── features/      Feature modules (analytics, auth, books, users)
├── lib/           Supabase client
├── services/      API service layer (books, users, analytics, etc.)
├── store/         (Reserved for future state management)
└── types/         TypeScript type definitions
```
