# Lehkhabu — Full Project Context

> **Purpose of this file:** This document contains everything an AI assistant (Gemini, Claude, ChatGPT, etc.) needs to understand the entire Lehkhabu project without reading the source code. Copy-paste this into any AI conversation for instant full-project context.

---

## 1. Project Overview

**Lehkhabu** is an AI-powered book marketplace focused on the **Mizo language** (spoken in Mizoram, Northeast India). It lets users discover, purchase, and read books. Authors submit and manage their publications through a moderated publishing pipeline. Admins moderate content and manage the platform.

**Key differentiator:** The AI backend uses hybrid RAG (Retrieval-Augmented Generation) to let users ask natural-language questions about any ingested book and receive streaming answers with page-level citations.

**Platform status:** In active development. Core features work; payment gateway and AI↔frontend Edge Function integration are still in progress.

---

## 2. Monorepo Structure

```
Lehkhabu/
├── frontend-user/        # React/Vite — User marketplace (PWA)       → localhost:5173
├── frontend-admin/       # React/Vite — Admin dashboard               → localhost:5174
├── backend-ai/           # Python/FastAPI — AI service                 → localhost:8001
├── backend-api/          # Python/FastAPI — REST API (reserved, not active)
├── shared/               # Shared TypeScript type definitions
├── supabase/             # Supabase Edge Functions
│   └── functions/
│       ├── ai-proxy/     # Edge Function proxy for backend-ai (deployed, CORS issues)
│       └── send-push/    # Web Push Notification trigger
├── migrations/           # Incremental SQL migration files
├── docs/
│   └── BOOK_INGESTION_GUIDE.md
├── supabase_schema.sql   # Full DB schema — apply in Supabase SQL Editor
├── storage_rls_policies.sql
├── storage_setup.sql
├── .env                  # Root env vars (Supabase keys for both frontends)
├── .env.template
├── Makefile
├── README.md
├── ARCHITECTURE.md
└── PROJECT_CONTEXT.md    # This file
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend (User)** | React 19, TypeScript, Vite, Zustand, Supabase JS, PWA (Workbox), Algolia, react-markdown |
| **Frontend (Admin)** | React 19, TypeScript, Vite, TanStack React Query, Recharts, Lucide Icons, date-fns, Supabase JS |
| **Backend AI** | Python 3.12+, FastAPI, SQLAlchemy (async/asyncpg), Celery, Gemini AI, Docling (IBM), pgvector, Alembic |
| **Backend API** | Python, FastAPI, SQLAlchemy, JWT auth (reserved — not deployed) |
| **Database** | Supabase (hosted PostgreSQL 15) with pgvector extension, RLS, triggers, stored functions |
| **Auth** | Supabase Auth (email/password only) |
| **Storage** | Supabase Storage — buckets: `book-covers`, `book-files`, `author-applications` |
| **AI: Embeddings** | `gemini-embedding-001` via Google Gemini API, truncated to 768 dims via `output_dimensionality` |
| **AI: Q&A + Summaries** | `gemini-3.1-flash-lite-preview` (Gemini Flash) |
| **Search** | Hybrid: pgvector cosine similarity (`<=>`) + PostgreSQL `tsvector` full-text + Reciprocal Rank Fusion |
| **CSS** | Vanilla CSS (no Tailwind) |

---

## 4. Data Flow

```
Users   ──▶ frontend-user  ──▶ Supabase (Auth + PostgreSQL + Storage)
Admins  ──▶ frontend-admin ──▶ Supabase (same project)
                                     │
                     DATABASE_URL    ▼
                               backend-ai (Python, port 8001)
                               ├── POST /ingest/upload  →  parse → chunk → embed → PostgreSQL
                               ├── GET  /qa             →  expand → hybrid search → Gemini SSE
                               └── GET  /summarize      →  pre-computed book/chapter summaries
```

- Both frontends communicate **directly with Supabase** using the public anon key + RLS
- `backend-ai` connects to the **same Supabase PostgreSQL** via `DATABASE_URL` (direct connection, not via Supabase client)
- `backend-ai` is **internal-only** — all routes (except `/health`) require `x-internal-key` header
- A Supabase Edge Function `ai-proxy` exists to allow the frontend to call `backend-ai` without exposing the internal key — but it has CORS preflight issues in production. Currently, `frontend-user` bypasses the proxy and calls `localhost:8001` directly with the `x-internal-key` for local development.
- `backend-api` is fully implemented but **not deployed** (reserved for future server-side needs like payment webhooks)

---

## 5. Database Schema

### Supabase Project
- **Project ID:** `puwqymuuibpysixvkund`
- **URL:** `https://puwqymuuibpysixvkund.supabase.co`
- Extensions: `pgvector`, `uuid-ossp`

### PostgreSQL Enum Types
```sql
userrole:                USER | AUTHOR | ADMIN
bookstatus:              DRAFT | PENDING_REVIEW | PUBLISHED | REJECTED | ARCHIVED
purchasestatus:          PENDING | COMPLETED | FAILED | REFUNDED
shelftype:               WANT_TO_READ | READING | READ
authorapplicationstatus: PENDING | APPROVED | REJECTED
```

> **IMPORTANT:** `books.status` is `VARCHAR(50)` (NOT the `bookstatus` enum) to support additional workflow states used by the publishing pipeline: `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`, `NEEDS_CHANGES`.

### Core Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | `id` (UUID PK), `email`, `username`, `full_name`, `role` (userrole), `supabase_uid`, `avatar_url`, `profile_bg_url`, `bio`, `social_links` (JSONB), `following_count`, `followers_count`, `is_active`, `is_email_verified`, `is_public_library`, `created_at` | `id` is internal UUID; `supabase_uid` refs `auth.users` |
| `author_profiles` | `id`, `user_id` (FK→users), `pen_name`, `website`, `bio`, `total_books`, `total_sales` | 1:1 with users; created on application approval |
| `books` | `id`, `author_id` (FK→author_profiles), `title`, `slug`, `description`, `language`, `category`, `tags[]`, `price`, `is_free`, `status` (VARCHAR), `cover_image_url`, `file_url`, `cover_color_primary`, `cover_color_secondary`, `total_pages`, `average_rating`, `rating_count`, `purchase_count`, `view_count`, `preview_pages`, `submitted_at`, `published_at`, `admin_notes`, `isbn` | status is VARCHAR not enum |
| `purchases` | `id`, `user_id`, `book_id`, `amount`, `amount_paid`, `is_free`, `currency`, `status` (purchasestatus), `razorpay_order_id`, `payment_ref`, `purchased_at` | Razorpay columns exist, gateway not configured |
| `reviews` | `id`, `user_id`, `book_id`, `rating` (1-5), `comment`, `created_at` | 1 per user per book (unique constraint) |
| `shelf_entries` | `id`, `user_id`, `book_id`, `shelf` (shelftype), `added_at` | upsert on conflict `user_id,book_id` |
| `reading_progress` | `id`, `user_id`, `book_id`, `current_page`, `percentage`, `last_read_at` | upsert on conflict `user_id,book_id` |
| `reading_challenges` | `id`, `user_id`, `year`, `goal`, `completed` | |
| `author_applications` | `id`, `user_id`, `writing_sample`, `motivation`, `genre`, `social_links`, `sample_file_url`, `sample_file_name`, `status` (authorapplicationstatus), `admin_notes`, `reviewed_by`, `submitted_at`, `reviewed_at` | |
| `announcements` | `id`, `title`, `content`, `is_active`, `created_by`, `created_at` | |
| `notifications` | `id`, `user_id`, `type`, `title`, `message`, `is_read`, `metadata` (JSONB), `created_at` | Triggers the `send-push` Edge Function via database trigger |
| `user_push_tokens` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at` | Web Push VAPID tokens (1 per device) |
| `admin_accounts` | `id` (refs `auth.users`), `email`, `role` (`admin`/`super_admin`/`readonly_admin`), `is_active`, `last_login_at` | Separate from `users` table |

### AI Tables (owned by backend-ai, managed by Alembic)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `book_chunks` | `id` (UUID), `book_id` (UUID FK→books.id), `chunk_index`, `page_number`, `chapter_title`, `section_title`, `child_text`, `parent_text`, `child_token_count`, `embedding` vector(768), `search_vector` (tsvector, computed), `created_at` | HNSW index on embedding; GIN index on search_vector |
| `book_summaries` | `id` (UUID), `book_id` (UUID), `level` (`full_book`/`chapter`), `chapter_title`, `chapter_index`, `summary_text`, `created_at` | |
| `ai_cache` | `id` (VARCHAR), `cache_key` (VARCHAR 128, unique), `response_text`, `created_at`, `expires_at`, `hit_count`, `last_hit` | Replaces Redis for response caching |

### Key Database Functions & Triggers
- `get_my_user_id()` — Returns `users.id` for the authenticated Supabase session
- `is_admin()` — Returns true if current auth user has active row in `admin_accounts`
- `handle_new_auth_user()` — Trigger on `auth.users` INSERT: auto-creates a `users` row
- `record_admin_login()` — Updates `last_login_at` in `admin_accounts`
- `create_author_approval_notification(p_user_id, p_status, p_admin_notes)` — SECURITY DEFINER: upgrades user role to AUTHOR + creates `author_profiles` row + sends notification
- `admin_set_user_role(p_user_id, p_new_role)` — RPC to set user role (USER or AUTHOR only; ADMIN blocked)

### Row Level Security (RLS)
All tables have RLS enabled. Key patterns:
- **users**: Public read, own-row update, admin full access via `is_admin()`
- **books**: Public read (PUBLISHED only), author manages own books, admin full access
- **purchases**: Own-only access, admin full access
- **reviews**: Public read, manage own, admin full access
- **shelf_entries / reading_progress**: Own-only access
- **notifications**: Own-only read/update; service_role or admin can insert
- **admin_accounts**: Authenticated read; super_admin can update
- **book_chunks / book_summaries / ai_cache**: No user-level RLS (backend-ai connects via service role)

---

## 6. Frontend — User Marketplace (`frontend-user`)

**Port:** 5173 | **Framework:** React 19 + Vite | **State:** Zustand | **Styling:** Vanilla CSS

### Pages & Routes
| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/auth` | AuthPage | Public | Login/signup |
| `/` | HomePage | ✅ | Featured books, hero carousel, categories |
| `/explore` | ExplorePage | ✅ | Browse/filter all books (Algolia or Supabase fallback) |
| `/search` | ExplorePage | ✅ | Same as /explore with URL query param |
| `/library` | LibraryPage | ✅ | Purchased books + reading progress + wishlist |
| `/book/:id` | BookDetailPage | ✅ | Book detail, reviews, AI Q&A panel (rendered with react-markdown), purchase |
| `/read/:id` | ReaderPage | ✅ | Custom text-based reader pulling context from `book_chunks` table, font/theme controls |
| `/u/:username` | PublicProfilePage | ✅ | Public user/author profile |
| `/profile` | ProfilePage | ✅ | Own profile with achievements, stats, reading goals |
| `/profile/settings/profile` | ProfileSettingsPage | ✅ | Edit name, bio, avatar, cover photo |
| `/profile/settings/account` | AccountSettingsPage | ✅ | Email, username, password |
| `/apply` | AuthorApplicationPage | ✅ | Apply to become an author |
| `/author` | AuthorDashboardPage | ✅ (AUTHOR) | Manage books, view stats, submit new books |
| `/achievements` | AchievementsPage | ✅ | Gamification badges |

### Key Services (`frontend-user/src/services/`)
- `auth.service.ts` — Supabase Auth (login, signup, logout, fetchUserProfile, upsertUserProfile)
- `books.service.ts` — `fetchAllBooks`, `fetchBookById`, `fetchAuthorBooks`, shelf CRUD, reading progress, purchases
- `purchases.service.ts` — `fetchUserPurchases`, `createPurchase`
- `author.service.ts` — `get_author_dashboard` RPC, book CRUD (create/update/delete/submit), notifications
- `profile.service.ts` — Profile CRUD, avatar/cover upload
- `ai.service.ts` — `streamBookQA()` (SSE), `getBookSummary()`, `getChapterSummaries()` — currently configured to bypass Supabase Edge Function and call `localhost:8001` directly with `x-internal-key` for local development.
- `algolia.ts` — Algolia search client (only active if `VITE_ALGOLIA_APP_ID` is set)

### State Stores (Zustand, `frontend-user/src/store/`)
- `authStore.ts` — Session, user, profile (`AppUserProfile`), loading state. On init: fetches session → loads profile → loads user book data. Blocks admin users from the user app.
- `booksStore.ts` — Books cache (5-min TTL), shelf entries, purchases (book IDs), readingProgress map. Persists `books` + `booksCachedAt` to localStorage.

### AppUserProfile shape
```typescript
{
  id: string;              // users.id (internal UUID)
  email: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  profile_bg_url: string | null;
  bio: string | null;
  role: 'USER' | 'AUTHOR' | 'ADMIN';
  is_active: boolean;
  is_email_verified: boolean;
  following_count: number;
  followers_count: number;
  supabase_uid: string;
  created_at: string;
  updated_at: string;
  social_links: Record<string, string> | null;
  is_public_library: boolean;
}
```

### Book shape (`Book` type in `books.service.ts`)
```typescript
{
  id: string; author_id: string; title: string; slug: string;
  description: string | null; language: string; category: string;
  tags: string[]; cover_image_url: string | null; file_url: string | null;
  cover_color_primary: string | null; cover_color_secondary: string | null;
  price: number; is_free: boolean; total_pages: number | null;
  average_rating: number; rating_count: number; purchase_count: number;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  published_at: string | null; created_at: string;
  author_name?: string;  // joined from author_profiles → users
}
```

### Publishing Workflow (7 statuses)
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/PUBLISHED
                              └──→ REJECTED
                              └──→ NEEDS_CHANGES → (author edits) → SUBMITTED again
```

### PWA Features
- Service worker via `vite-plugin-pwa` + Workbox
- `PWAInstallBanner.tsx`, `UpdateNotification.tsx`
- Web Push Notifications (Native OS push via VAPID keys)
- Offline capable for cached content

### Key Hooks
- `usePushNotifications.ts` — Manages Notification permissions, Service Worker registration, and DB syncing
- `useNotifications.ts` — Real-time Supabase Realtime subscription for notification bell
- `usePWA.ts` — Install/update detection
- `usePageMeta.ts` — Dynamic `<title>` + `<meta description>`

---

## 7. Frontend — Admin Dashboard (`frontend-admin`)

**Port:** 5174 | **Framework:** React 19 + Vite | **State:** TanStack React Query | **Styling:** Vanilla CSS (dark theme)

### Pages & Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | AdminLoginPage | Standalone login (not wrapped in AdminLayout) |
| `/` | DashboardPage | Stats (books, users, revenue, new apps), activity feed |
| `/books` | BooksPage | Book publishing queue: approve, reject, request changes |
| `/authors` | AuthorsPage | View all authors + their books/sales |
| `/users` | UsersPage | Manage users, toggle active, change roles |
| `/applications` | ApplicationsPage | Review author applications (real-time via Supabase Realtime) |
| `/orders` | OrdersPage | All purchases/orders |
| `/analytics` | AnalyticsPage | Charts: revenue, genre distribution, user growth |
| `/announcements` | AnnouncementsPage | Create/manage platform announcements |
| `/ui-settings` | UISettingsPage | Platform appearance customization (Currently disabled/hidden due to missing `app_settings` table) |
| `/settings` | SettingsPage | Admin settings |
| `/admins` | AdminAccountsPage | Manage admin team (super_admin only) |

### Auth Flow (Admin)
1. Admin enters credentials at `/login`
2. Supabase Auth validates credentials
3. App checks `admin_accounts` table — must have matching active email
4. If not found → "Not authorized" error; if found → store `adminRole` in context → redirect to `/`

### Admin Roles
- `super_admin` — Full access including admin management
- `admin` — Full book/user/application management  
- `readonly_admin` — View only; action buttons disabled

### Key Services (`frontend-admin/src/services/`)
- `books.service.ts` — `fetchBooks()`, `approveBook()`, `rejectBook()`, `requestChanges()`, `markUnderReview()`, `deleteBook()`
- `users.service.ts` — `fetchUsers()`, `fetchAuthors()`, `fetchApplications()`, `approveApplication()`, `rejectApplication()`, `updateUserActive()`, `updateUserRole()`, real-time subscriptions
- `analytics.service.ts` — Platform stats, revenue charts, genre distribution
- `announcements.service.ts` — CRUD
- `settings.service.ts` — Platform settings

### AdminBook type
```typescript
{
  id, title, author, authorId, category, price, isFree, status: AdminBookStatus,
  coverImageUrl?, coverColorPrimary?, totalPages?, averageRating, ratingCount,
  purchaseCount, language, description?, tags[], adminNotes?,
  submittedAt?, publishedAt?, fileUrl?
}
// AdminBookStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_CHANGES' | 'PUBLISHED'
```

---

## 8. Backend AI Service (`backend-ai`)

**Port:** 8001 | **Framework:** FastAPI | **Auth:** `x-internal-key` header on all routes except `/health`

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `{"status": "ok"}` |
| POST | `/ingest` | Queue book ingestion via Celery (takes `book_id`, `book_title`, `file_url`) |
| POST | `/ingest/upload` | Multipart upload — ingest local file (takes `book_id`, `book_title`, `file`) |
| GET | `/ingest/{task_id}/status` | Poll Celery task status |
| GET | `/qa` | SSE streaming Q&A (`?book_id=&question=&book_title=`) |
| GET | `/summarize/{book_id}` | Full book summary |
| GET | `/summarize/{book_id}/chapters` | Chapter-level summaries list |

### Ingestion Pipeline (synchronous for `/ingest/upload`, async Celery for `/ingest`)
```
POST /ingest/upload
    ↓
1. PARSE   — Docling (IBM) extracts text from PDF/EPUB
             Two-pass: embedded text first → OCR fallback for scanned pages
             Outputs: sections with chapter_title, section_title, page_number, text
             ↓
2. CHUNK   — Parent-child chunking strategy:
             child_text (~256 tokens): used for RETRIEVAL (precise semantic match)
             parent_text (~768 tokens = prev_child + current + next_child): used for CONTEXT
             ↓
3. EMBED   — gemini-embedding-001, task_type="retrieval_document", output_dimensionality=768
             Batches of 100 chunks per API call, 1.5s between batches (rate limiting)
             Free tier: 1,000 API calls/day
             ↓
4. STORE   — BookChunk rows inserted to book_chunks; search_vector computed by PostgreSQL
             ↓
5. SUMMARIZE — Hierarchical: chunks → section summaries → chapter summaries → full book
               Uses gemini-3.1-flash-lite-preview (sync calls to avoid grpc.aio event loop issues)
               Saved to book_summaries + ai_cache
```

### Q&A Pipeline (real-time SSE)
```
GET /qa?book_id=&question=&book_title=
    ↓
1. Cache check — look up in ai_cache (TTL 24h)
    ↓ (cache miss)
2. Query expansion — Gemini Flash generates 2 paraphrases of the question
    ↓
3. Embed query — Average of 3 embeddings (original + 2 paraphrases)
                 task_type="retrieval_query", output_dimensionality=768
    ↓
4. Vector search — pgvector: top 20 chunks by cosine similarity (HNSW index)
    ↓
5. FTS search — PostgreSQL tsvector: top 20 chunks by ts_rank
                (websearch_to_tsquery for natural language query handling)
    ↓
6. RRF fusion — score = 1/(rank+60), pick top 8 combined
    ↓
7. Generate — Stream answer from Gemini Flash using parent_text as context
    ↓
8. Cache — Store complete answer in ai_cache for 24h
    ↓
SSE stream: data: {"text": "...", "done": false}  (word by word)
            data: {"sources": [...], "done": true}
```

### SQLAlchemy Models (`app/models/chunk.py`)
```python
# CRITICAL: book_id and id are UUID columns in PostgreSQL.
# Must use UUID(as_uuid=False) — NOT String(36) — or asyncpg throws:
# "operator does not exist: uuid = character varying"
from sqlalchemy.dialects.postgresql import UUID

class BookChunk(Base):
    __tablename__ = "book_chunks"
    id       = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id  = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    # ... child_text, parent_text, embedding Vector(768), search_vector (Computed tsvector)

class BookSummary(Base):
    __tablename__ = "book_summaries"
    id       = mapped_column(UUID(as_uuid=False), primary_key=True, ...)
    book_id  = mapped_column(UUID(as_uuid=False), nullable=False, ...)

class AICache(Base):
    __tablename__ = "ai_cache"
    id = mapped_column(String(36), ...)  # ai_cache.id is varchar, not uuid
```

### Key Files
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, routes, startup |
| `app/core/config.py` | All settings (embedding_model, embedding_dimensions, etc.) |
| `app/core/database.py` | Async SQLAlchemy engine + session factory |
| `app/ingestion/parser.py` | PDF/EPUB parsing via Docling |
| `app/ingestion/chunker.py` | Parent-child chunk creation |
| `app/ingestion/embedder.py` | Gemini batch embedding with retry/backoff |
| `app/ingestion/pipeline.py` | Full pipeline orchestration |
| `app/retrieval/search.py` | Hybrid search: vector + FTS + RRF |
| `app/generation/query_expander.py` | Expand query into 3 variants |
| `app/generation/prompts.py` | Prompt templates |
| `app/generation/qa.py` | Q&A answer streaming |
| `app/generation/summarize.py` | Hierarchical summaries |
| `app/generation/cache.py` | PostgreSQL cache read/write |
| `app/models/chunk.py` | SQLAlchemy models for AI tables |
| `app/worker/celery_app.py` | Celery configuration |
| `app/worker/book_tasks.py` | Celery task: `ingest_book_task` |

### Configuration (`app/core/config.py`)
```python
embedding_model       = "models/gemini-embedding-001"
embedding_dimensions  = 768  # Matryoshka truncation via output_dimensionality=768
qa_model              = "models/gemini-3.1-flash-lite-preview"
summary_model         = "models/gemini-3.1-flash-lite-preview"
child_chunk_size      = 256   # tokens
embedding_batch_size  = 100   # chunks per API call
top_k_chunks          = 8     # chunks returned after RRF
vector_fetch_count    = 20    # pre-fusion over-fetch
fts_fetch_count       = 20
qa_cache_ttl_hours    = 24
summary_cache_ttl_hours = 168  # 7 days
```

### Alembic Migrations (`backend-ai/alembic/versions/`)
| Revision | Description |
|----------|-------------|
| `95fe228d1010` | Create AI tables: book_chunks, book_summaries, ai_cache |
| `73af8b5007a4` | Add HNSW index (halfvec cast for 3072 dims) |
| `b2c3d4e5f6a7` | Upgrade embedding from vector(768) → vector(3072) |
| `c4d5e6f7a8b9` | Downsize back to vector(768) — **current HEAD** |

To sync a fresh DB: `alembic stamp head && alembic upgrade head`

### Zero-Redis Architecture
Everything uses PostgreSQL:
- `ai_cache` table: response caching with TTL (replaces Redis)
- Celery: uses `sqla+postgresql://` broker (PostgreSQL) instead of Redis
- pgvector: vector similarity search

---

## 9. Supabase Edge Function (`ai-proxy`)

**Location:** `supabase/functions/ai-proxy/`

**Purpose:** Proxy frontend AI requests to `backend-ai` so the `INTERNAL_API_KEY` is never exposed to the browser.

**How it works:**
1. Frontend calls edge function with Supabase Auth bearer token
2. Edge function validates session server-side
3. Appends `x-internal-key` header and forwards to `backend-ai`
4. Streams SSE response back to the browser

**Current status:** Deployed but has CORS preflight issues in production. AI features are tested directly against `http://localhost:8001` during development.

**Frontend calls it via:**
```typescript
// ai.service.ts
const AI_PROXY_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`;
// GET /ai-proxy?action=qa&book_id=...&question=...
// GET /ai-proxy?action=summary&book_id=...
// GET /ai-proxy?action=chapters&book_id=...
```

### 9.2 `send-push` Edge Function
**Location:** `supabase/functions/send-push/`

**Purpose:** Delivers native Web Push notifications to user devices.

**How it works:**
1. A database trigger (`on_notification_insert`) fires when a row is added to the `notifications` table.
2. The trigger calls `send-push` via `pg_net` (PostgreSQL network extension) with the payload.
3. The function fetches the user's saved tokens from `user_push_tokens`.
4. It signs a JWT and delivers the push directly to Chrome/Safari/Edge using the Web Push API (web-push npm package).

---

## 10. Environment Variables

### Root `.env` (used by both frontends via Vite)
```env
VITE_SUPABASE_URL=https://puwqymuuibpysixvkund.supabase.co
VITE_SUPABASE_ANON_KEY=<public_anon_key>
# Optional Algolia (if not set, fallback to Supabase search):
VITE_ALGOLIA_APP_ID=
VITE_ALGOLIA_SEARCH_KEY=
```

### `backend-ai/.env`
```env
DATABASE_URL=postgresql+asyncpg://postgres:<password>@<host>:5432/postgres
GEMINI_API_KEY=<gemini_api_key>
INTERNAL_API_KEY=<hex_secret_for_x-internal-key>
CELERY_BROKER_URL=sqla+postgresql://postgres:<password>@<host>:5432/postgres
CELERY_RESULT_BACKEND=db+postgresql://postgres:<password>@<host>:5432/postgres
CORS_ORIGINS=*
```

---

## 11. How to Run Locally

```bash
# Terminal 1: User Marketplace
cd frontend-user && npm run dev        # → http://localhost:5173

# Terminal 2: Admin Dashboard
cd frontend-admin && npm run dev       # → http://localhost:5174

# Terminal 3: Backend AI (FastAPI with hot reload)
cd backend-ai
./.venv/bin/uvicorn main:app --reload --port 8001  # → http://localhost:8001

# Terminal 4 (optional): Celery Worker for background ingestion
cd backend-ai
./.venv/bin/celery -A app.worker.celery_app worker --loglevel=info --pool=solo
```

Or use the Makefile:
```bash
make install   # Install all deps
make dev       # Start all services concurrently
```

### Test ingestion directly
```bash
curl -X POST http://localhost:8001/ingest/upload \
  -H "x-internal-key: <INTERNAL_API_KEY>" \
  -F "book_id=<uuid>" \
  -F "book_title=My Book" \
  -F "file=@/path/to/book.pdf"
```

---

## 12. Security Architecture

1. **Admin gate** — Admin access controlled by `admin_accounts` table (separate from `users`). `is_admin()` SQL function checks this. User app blocks admins on login.
2. **Role escalation prevention** — `admin_set_user_role` RPC blocks setting ADMIN role; frontend also hard-guards it.
3. **RLS** — All tables. Users access only their own data via `auth.uid()`. Admins get full access via `is_admin()`.
4. **Backend AI** — Internal-only. All routes require `x-internal-key`. Never directly exposed to internet.
5. **Auth triggers** — `handle_new_auth_user()` auto-creates `users` row; `create_author_approval_notification()` is SECURITY DEFINER to safely upgrade roles.
6. **CORS** — Supabase handles CORS for direct DB access. `backend-ai` has configurable `CORS_ORIGINS`.
7. **Storage** — Supabase Storage RLS policies on `book-covers`, `book-files`, `author-applications` buckets.

---

## 13. Current State & Known Issues

### ✅ Working
- User registration/login (Supabase Auth)
- Book catalog browsing, detail pages, book cover display
- Author application submission and admin approval workflow
- Author dashboard: book CRUD, status transitions, file uploads
- Admin dashboard: book moderation queue, user management, analytics
- Admin application review with real-time Supabase Realtime updates
- Reading progress tracking (saved to DB, shown in Library)
- Wishlist / shelf management
- Gamification: achievements, reading goals, stats
- Profile pages with social links, avatar, cover photo
- PWA: installable, offline cache, update notifications
- Backend AI: ingestion pipeline, Q&A, summaries (works end-to-end on localhost directly from frontend bypassing Edge function)
- Custom text-based book reader pulling context directly from database chunks (`book_chunks`)
- Q&A Markdown rendering properly in the frontend (`react-markdown`)
- `book_chunks.book_id` is correctly typed as `UUID(as_uuid=False)` in SQLAlchemy (fixed)
- Web Push Notifications via Service Worker, `user_push_tokens` table, and `send-push` Edge Function

### ⏳ In Progress / Not Yet Active
- **Payment** — Razorpay columns and purchase flow exist in UI; payment gateway not configured. Books are free during beta.
- **AI ↔ Frontend** — Edge Function `ai-proxy` has CORS preflight issues in production. Bypassed for local dev via direct localhost calls.
- **Algolia** — Frontend code is complete and falls back to Supabase search. Needs API keys to activate.
- **Embedding quota** — Free tier: 1,000 API calls/day for `gemini-embedding-001`. Large books may exhaust quota in a single ingestion. Resets daily at midnight Pacific time.
- **UI Settings (Admin)** — Route temporarily removed due to missing `app_settings` table.

### ⚠️ Known Gotchas
- `books.status` is `VARCHAR(50)` not an enum — don't use the `bookstatus` enum type for it
- `book_chunks.book_id` must be `UUID(as_uuid=False)` in SQLAlchemy, not `String(36)` — asyncpg will throw `operator does not exist: uuid = character varying` otherwise
- Gemini summarize calls use **synchronous** `generate_content()` (not async) to avoid grpc.aio event loop issues in Celery workers
- `gemini-embedding-004` is NOT available on the current API key — use `gemini-embedding-001` with `output_dimensionality=768`
- Admin users cannot access the user marketplace — `authStore.ts` explicitly blocks them and signs them out
- Safari on macOS `localhost` can silently block Service Worker installation and Web Push. Best tested on Chrome.
- Vite PWA dev mode requires a `try/catch` wrapper around SPA routing (`NavigationRoute`) in `sw.ts` to prevent crashing during installation.

---

*Last updated: June 5, 2026 — reflects current working state after implementing Web Push Notifications end-to-end with Supabase Edge Functions.*
