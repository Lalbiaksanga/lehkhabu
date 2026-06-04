# Lehkhabu

AI-powered Mizo-language book marketplace. Users can discover, purchase, and read books. Authors can submit and manage their publications. Admins can moderate content and manage the platform.

## Architecture

```
Lehkhabu/
├── frontend-user/    React/Vite — User marketplace (PWA)       → localhost:5173
├── frontend-admin/   React/Vite — Admin dashboard               → localhost:5174
├── backend-ai/       Python/FastAPI — AI service (ingestion, Q&A, summaries) → localhost:8001
├── backend-api/      Python/FastAPI — REST API (reserved for future use)
├── shared/           Shared TypeScript type definitions
└── supabase_schema.sql  Complete database schema (run in Supabase SQL Editor)
```

Both frontends communicate **directly with Supabase** (PostgreSQL + Auth + Storage).
The backend-ai service provides AI features (book ingestion, hybrid search Q&A, summarization) via internal API.

## Quick Start

```bash
# 1. Install dependencies
cd frontend-user && npm install --legacy-peer-deps && cd ..
cd frontend-admin && npm install && cd ..

# 2. Copy and configure environment
cp .env.template .env    # Fill in Supabase URL and anon key

# 3. Run the database schema (copy supabase_schema.sql into Supabase SQL Editor)

# 4. Start services
cd frontend-user && npm run dev     # Terminal 1: http://localhost:5173
cd frontend-admin && npm run dev    # Terminal 2: http://localhost:5174
cd backend-ai && source .venv/bin/activate && uvicorn main:app --reload --port 8001  # Terminal 3
```

## Environment Variables

See [.env.template](.env.template) for all required variables.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed architecture and security notes
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — Full project context for AI assistants
- [backend-ai/CLAUDE.md](backend-ai/CLAUDE.md) — AI service architecture details
