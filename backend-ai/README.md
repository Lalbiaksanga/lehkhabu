# Lehkhabu Backend-AI

AI microservice for the Lehkhabu book platform: ingestion, hybrid RAG Q&A (SSE), and summaries.

Runs on **port 8001**. Called only by `backend-api` (not public internet).

## Requirements

- Python 3.12+ (recommended)
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- Gemini API key

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.template .env       # fill in DATABASE_URL, GEMINI_API_KEY, INTERNAL_API_KEY, Celery URLs
alembic upgrade head
```

## Run

```bash
# Terminal 1 — API
uvicorn main:app --reload --port 8001

# Terminal 2 — ingestion worker
celery -A app.worker.celery_app worker --loglevel=info
```

Health check: `GET http://localhost:8001/health`

## API (all require `x-internal-key` except `/health`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Queue book ingestion (Celery) |
| GET | `/ingest/{task_id}/status` | Poll ingestion status |
| GET | `/qa?book_id=&question=&book_title=` | SSE Q&A stream |
| GET | `/summarize/{book_id}` | Full book summary |
| GET | `/summarize/{book_id}/chapters` | Chapter summaries |

## Tests

```bash
pytest
```

## Manual end-to-end script

With the API running and `.env` configured:

```bash
python test_workflow.py
```

## Embedding dimension change

If you upgraded from 768-dim embeddings, run `alembic upgrade head` and **re-ingest all books** (migration truncates `book_chunks`).

See [CLAUDE.md](./CLAUDE.md) for architecture details.
