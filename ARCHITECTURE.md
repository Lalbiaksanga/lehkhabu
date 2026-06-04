# Lehkhabu — Project Architecture Notes

## Monorepo Structure

```
Lehkhabu/
├── frontend-admin/   React/Vite — Admin dashboard (Supabase-driven)
├── frontend-user/    React/Vite — User-facing marketplace (Supabase-driven, PWA)
├── backend-ai/       Python/FastAPI — AI service (book ingestion, hybrid RAG Q&A, summaries)
├── backend-api/      Python/FastAPI — REST API (reserved for future server-side use cases)
└── shared/           Shared TypeScript type definitions & utilities
```

## Data Flow

```
┌─────────────────┐     ┌──────────────────────┐
│  frontend-user  │────▶│    Supabase          │
│  (React/Vite)   │◀────│  ┌────────────────┐  │
└─────────────────┘     │  │  PostgreSQL     │  │
                        │  │  Auth           │  │
┌─────────────────┐     │  │  Storage        │  │
│  frontend-admin │────▶│  │  Realtime       │  │
│  (React/Vite)   │◀────│  └────────────────┘  │
└─────────────────┘     └──────────┬───────────┘
                                   │
                        ┌──────────┴───────────┐
                        │   backend-ai         │
                        │   (FastAPI)          │
                        │   ┌────────────────┐ │
                        │   │ Ingestion      │ │
                        │   │ Hybrid Search  │ │
                        │   │ Summarization  │ │
                        │   │ Gemini AI      │ │
                        │   └────────────────┘ │
                        └──────────────────────┘
```

Both frontends communicate **directly with Supabase** (PostgreSQL + Auth + Storage + Realtime).

- `backend-api/` is production-quality and security-hardened (JWT auth, rate limiting, CORS),
  but is currently **not deployed**. It exists for future REST API use cases (e.g. server-side
  payment webhook handling, heavy computation, third-party integrations).
- `backend-ai/` is a fully implemented AI service that handles book ingestion (PDF/EPUB → chunks → embeddings),
  hybrid search (pgvector + tsvector + RRF), SSE streaming Q&A, and hierarchical book summaries.
  See [backend-ai/CLAUDE.md](backend-ai/CLAUDE.md) for complete architecture details.

## Running Locally

```bash
# Terminal 1 — User Marketplace
cd frontend-user && npm run dev     # http://localhost:5173

# Terminal 2 — Admin Dashboard
cd frontend-admin && npm run dev    # http://localhost:5174

# Terminal 3 — AI Service
cd backend-ai && source .venv/bin/activate
uvicorn main:app --reload --port 8001   # http://localhost:8001
```

## Key Environment Variables

Both frontends require a `.env` file at the monorepo root:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The backend-ai service has its own `.env` inside `backend-ai/`:
```
DATABASE_URL=postgresql+asyncpg://user:password@host:port/dbname
GEMINI_API_KEY=your_key_here
INTERNAL_API_KEY=your_secret_here
```

## Security Architecture

- **Admin access** is gated by the `admin_accounts` table — NOT by `users.role`.
  Any user with a matching active email in `admin_accounts` is granted admin UI access.
- **Author roles** are set server-side via the `admin_set_user_role` Supabase RPC function
  to prevent client-side role escalation.
- **RLS** is enabled on all tables. Admin UI queries work via `is_admin()` helper function
  that checks the `admin_accounts` table.
- **backend-ai** is internal-only — all routes (except `/health`) require the `x-internal-key` header.
