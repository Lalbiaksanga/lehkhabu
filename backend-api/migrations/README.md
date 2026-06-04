# Lehkhabu — Database Migrations

This folder contains all SQL migration files for the Lehkhabu database running on **Supabase (PostgreSQL)**.

## Approach

We use a **dual-layer migration system**:

| Layer | Tool | Purpose |
|-------|------|---------|
| **SQL Migrations** | `/migrations/*.sql` | Source-of-truth SQL files, tracked in git, applied via Supabase |
| **SQLAlchemy Models** | `app/models/*.py` | Python ORM layer for the FastAPI backend (must stay in sync with SQL) |
| **Alembic** | `alembic/` | Generates migration SQL from model diffs (see below) |

## Folder Structure

```
migrations/
  0001_initial_schema.sql          ← Core tables: users, books, author_profiles
  0002_purchases_and_shelf.sql     ← Purchases, reviews, shelf entries, reading progress
  0003_challenges_and_apps.sql     ← Reading challenges, author applications, announcements
  0004_rls_policies.sql            ← Row Level Security policies
  0005_auth_trigger.sql            ← Supabase auth → public.users sync trigger
  0006_seed_demo_data.sql          ← Sample books and demo author (dev only)
```

## Naming Convention

```
NNNN_short_description.sql
```
- `NNNN` — zero-padded 4-digit sequence number
- `short_description` — snake_case description of what the migration does

## Running Migrations

### Via Supabase Dashboard
1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/thdltkblbodghicxfgdh/sql)
2. Paste the contents of the migration file
3. Click **Run**

### Via psql (command line)
```bash
# Set connection string
export DATABASE_URL="postgresql://postgres:PASSWORD@db.thdltkblbodghicxfgdh.supabase.co:5432/postgres"

# Run a specific migration
psql $DATABASE_URL -f migrations/0001_initial_schema.sql
```

### Via Python (alembic) — for model changes
```bash
cd backend-api

# Create/activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Generate a new migration from model changes
alembic revision --autogenerate -m "description_of_change"

# Apply pending migrations
alembic upgrade head
```

## Rules — Schema Discipline

1. **Never modify the database directly** — always create a migration file first.
2. **Every model change** in `app/models/` must have a corresponding `.sql` migration.
3. **Migrations are immutable** — never edit an existing migration. Add a new one instead.
4. **Keep models in sync** — the SQLAlchemy models in `app/models/` must always match the live schema.
5. **Test migrations** on a branch/staging before applying to production.

## Current Schema Version

| Migration | Status |
|-----------|--------|
| 0001 — Initial schema | ✅ Applied |
| 0002 — Purchases & shelf | ✅ Applied |
| 0003 — Challenges & applications | ✅ Applied |
| 0004 — RLS policies | ✅ Applied |
| 0005 — Auth trigger | ✅ Applied |
| 0006 — Seed demo data | ✅ Applied (dev only) |
