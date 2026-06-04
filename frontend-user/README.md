# Lehkhabu — User Marketplace

User-facing book marketplace for the Lehkhabu platform. Built with React, TypeScript, and Vite. Installable as a Progressive Web App (PWA).

## Features

- **Home** — Featured books, categories, and personalized recommendations
- **Explore** — Browse and filter the full book catalog
- **Book Detail** — View book info, ratings, reviews, and purchase
- **Reader** — In-app book reader
- **Library** — Personal collection of purchased books
- **Author Dashboard** — Authors can submit and manage their books
- **Author Application** — Apply to become an author
- **Profile** — User profile, settings, and achievements
- **Search** — Algolia-powered instant search (optional)
- **PWA** — Installable, offline-capable, with push notifications

## Tech Stack

- React 19 + TypeScript
- Vite (dev server + build)
- Supabase (auth, database, storage, realtime)
- Zustand (state management)
- Workbox / vite-plugin-pwa (service worker)
- Algolia (optional search integration)

## Setup

```bash
npm install --legacy-peer-deps    # Required for vite-plugin-pwa compat
npm run dev                        # http://localhost:5173
```

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env` file.

## Project Structure

```
src/
├── components/    Shared UI (BookCard, BookCover, layout, search, auth)
├── hooks/         Custom hooks (notifications, PWA, page meta)
├── lib/           Supabase and Algolia clients
├── pages/         All page components
├── services/      API service layer (books, auth, purchases, etc.)
├── store/         Zustand stores (auth, books)
└── types.ts       TypeScript type definitions
```
