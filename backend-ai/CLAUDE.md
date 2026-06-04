# Lehkhabu — AI Service (backend-ai)

## What this service does
Handles all AI features for Lehkhabu: book ingestion, Q&A, and summarization.
Runs as a separate FastAPI service on port 8001.
Connects to the same PostgreSQL database as backend-api.
No Redis. No Pinecone. Everything in PostgreSQL.

## Exact tech stack
- FastAPI + Python 3.12+ on port 8001
- Docling (IBM) — PDF/EPUB parsing, structure-aware (headings, tables, pages)
- Gemini `gemini-embedding-2-preview` — 3072-dim embeddings (halfvec HNSW index in PostgreSQL)
- Gemini `gemini-3.1-flash-lite-preview` — Q&A streaming and hierarchical summaries
- pgvector — vector similarity search inside PostgreSQL
- PostgreSQL tsvector — full-text keyword search inside PostgreSQL
- RRF (Reciprocal Rank Fusion) — pure Python, combines both search results
- SSE (Server-Sent Events) — streams Q&A answers word by word
- PostgreSQL ai_cache table — replaces Redis for caching

## Architecture decision: why no Redis
Redis was removed in favour of a PostgreSQL cache table (ai_cache).
The ai_cache table has: cache_key, response_text, expires_at.
A cached row is valid if expires_at > NOW().
Celery uses SQLAlchemy broker (PostgreSQL) instead of Redis.
This means zero extra services — everything runs on one database.

## Chunking strategy: parent-child
We do NOT use simple fixed-size chunks.
- child_text: ~256 tokens — used for embedding and search (small = precise match)
- parent_text: ~768 tokens (prev child + this child + next child) — used as Gemini context
- We retrieve by child similarity, but send parent to Gemini for the answer
- This gives precise retrieval AND rich context in the answer

## Search strategy: hybrid (vector + FTS + RRF)
1. Expand query: Gemini Flash generates 2 paraphrases of the user question
2. Embed: average the 3 query embeddings (broader semantic coverage)
3. Vector search: pgvector cosine similarity via `embedding::halfvec(3072)`, fetch top 20
4. Full-text search: PostgreSQL tsvector with `search_vector @@ query`, fetch top 20
5. RRF: combine both lists by rank, score = 1/(rank+60) from each, pick top 8
This is significantly more accurate than pure vector search alone.

## Critical numbers — never change without testing
- child_chunk_size = 256 tokens
- embedding_dimensions = 3072 (fixed by gemini-embedding-2-preview)
- top_k_chunks = 8 (final chunks after RRF)
- vector_fetch_count = 20 (over-fetch before fusion)
- temperature for Q&A = 0.15
- temperature for summaries = 0.3
- qa_cache_ttl_hours = 24
- summary_cache_ttl_hours = 168 (7 days)

## Where each file lives
| What | File |
|---|---|
| PDF/EPUB parsing | app/ingestion/parser.py |
| Parent-child chunking | app/ingestion/chunker.py |
| Gemini embedding calls | app/ingestion/embedder.py |
| Full ingestion orchestration | app/ingestion/pipeline.py |
| Hybrid search (vector + FTS + RRF) | app/retrieval/search.py |
| Query expansion | app/generation/query_expander.py |
| All prompt templates | app/generation/prompts.py |
| Q&A SSE streaming | app/generation/qa.py |
| Hierarchical summarization | app/generation/summarize.py |
| PostgreSQL cache | app/generation/cache.py |
| SQLAlchemy models | app/models/chunk.py |
| Settings | app/core/config.py |
| Q&A route (SSE) | app/routes/qa.py |
| Summary route | app/routes/summarize.py |
| Ingest trigger route | app/routes/ingest.py |

## Database tables this service owns
- book_chunks: child_text, parent_text, embedding vector(3072), search_vector (tsvector, computed)
- book_summaries: pre-computed chapter and full-book summaries
- ai_cache: key-value cache with expires_at TTL

## Migrations
After pulling schema changes, run:
```bash
alembic upgrade head
```
Migration `b2c3d4e5f6a7` upgrades embedding column from 768→3072 and **truncates book_chunks** — re-ingest all books afterward.

## Absolute rules — never violate
1. NEVER send the full book to Gemini. Always retrieve top_k_chunks first.
2. ALWAYS check ai_cache before making any Gemini API call.
3. ALWAYS use streaming (generate_content_async + stream=True) in Q&A routes.
4. NEVER expose this service to the internet — called only from backend-api.
5. The /ingest route REQUIRES x-internal-key header. Never remove this.
6. ALWAYS use task_type="retrieval_document" for chunk embeddings, "retrieval_query" for query embeddings.
7. After re-ingestion, the old cache rows will expire naturally (TTL). Do not manually delete them unless re-ingesting.
8. The search_vector column is computed by PostgreSQL automatically. Never try to set it manually.
9. Vector search queries MUST cast: `embedding::halfvec(3072) <=> query::halfvec(3072)` to use the HNSW index.

## How to run
```bash
# API server
uvicorn main:app --reload --port 8001

# Celery worker (separate terminal)
celery -A app.worker.celery_app worker --loglevel=info

# Celery beat (optional — cache cleanup every hour)
celery -A app.worker.celery_app beat --loglevel=info
```
