# Lehkhabu — Book Ingestion Guide (AI Pipeline)

This guide walks you through ingesting a real book so the AI Q&A feature works.

---

## Prerequisites

You need these running BEFORE you start:

| Service          | Command                                                                   | Port |
|------------------|---------------------------------------------------------------------------|------|
| PostgreSQL       | Should already be running as a system service                             | 5432 |
| backend-ai       | `cd backend-ai && ./.venv/bin/uvicorn main:app --port 8001`              | 8001 |
| Celery worker    | `cd backend-ai && ./.venv/bin/celery -A app.worker.celery_app worker --loglevel=info` | —    |

Verify the backend is healthy:

```bash
curl http://localhost:8001/health
```

Expected: `{"status":"healthy", ...}`

---

## Step 1: Get the Internal API Key

The key is in `backend-ai/.env`:

```
INTERNAL_API_KEY=f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4
```

All API calls below require this as a header:
```
x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4
```

---

## Step 2: Choose a Book to Ingest

You need:
- A **book_id** — the UUID of a book in your `books` table
- A **book_title** — the title of that book
- A **PDF file** of the book

To find seed books:
```sql
SELECT id, title FROM books WHERE status = 'PUBLISHED' LIMIT 10;
```

Pick one and note the `id` and `title`.

---

## Step 3: Ingest via Direct Upload (Recommended)

This method uploads a file directly and runs the full pipeline synchronously.
No Celery worker needed for this method, but it blocks until done (1-10 minutes).

```bash
curl -X POST http://localhost:8001/ingest/upload \
  -H "x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4" \
  -F "file=@/path/to/your/book.pdf" \
  -F "book_id=YOUR_BOOK_UUID_HERE" \
  -F "book_title=Your Book Title Here"
```

**Example with a seed book:**
```bash
curl -X POST http://localhost:8001/ingest/upload \
  -H "x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4" \
  -F "file=@./sample-book.pdf" \
  -F "book_id=10000000-0000-0000-0000-000000000001" \
  -F "book_title=Khawngaihthlak Thlipui"
```

Expected response (when complete):
```json
{
  "status": "completed",
  "message": "Ingestion complete for 'Khawngaihthlak Thlipui'",
  "chunks_created": 47,
  "summaries_created": 6
}
```

---

## Step 3 (Alternative): Ingest via Celery Task

If you want non-blocking ingestion (the book file must be accessible via a URL):

```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -H "x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4" \
  -d '{
    "book_id": "10000000-0000-0000-0000-000000000001",
    "book_title": "Khawngaihthlak Thlipui",
    "file_url": "https://your-supabase-url.storage/book-files/path/to/file.pdf"
  }'
```

Response (immediate):
```json
{
  "task_id": "abc123-def456",
  "status": "queued",
  "message": "Ingestion started for 'Khawngaihthlak Thlipui'"
}
```

Monitor the task:
```bash
curl http://localhost:8001/ingest/abc123-def456/status \
  -H "x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4"
```

Expected: `{"task_id": "...", "status": "SUCCESS", "result": {...}}`

---

## Step 4: Verify Chunks Were Created

After ingestion completes, check the `book_chunks` table:

```sql
SELECT book_id, chunk_type, COUNT(*) as count
FROM book_chunks
WHERE book_id = 'YOUR_BOOK_UUID_HERE'
GROUP BY book_id, chunk_type;
```

Expected: Rows for `parent` and `child` chunk types.

---

## Step 5: Verify Summary Was Created

```sql
SELECT book_id, level, chapter_title, LEFT(summary_text, 100) as preview
FROM book_summaries
WHERE book_id = 'YOUR_BOOK_UUID_HERE'
ORDER BY level, chapter_index;
```

Expected: One `full_book` row and several `chapter` rows.

---

## Step 6: Test the Q&A Endpoint with curl

```bash
curl "http://localhost:8001/qa?book_id=YOUR_BOOK_UUID_HERE&question=What%20is%20this%20book%20about%3F&book_title=Your%20Book%20Title" \
  -H "x-internal-key: f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4" \
  -H "Accept: text/event-stream"
```

Expected: SSE stream of events:
```
data: {"text": "This ", "done": false}
data: {"text": "book ", "done": false}
data: {"text": "explores ", "done": false}
...
data: {"sources": [...], "done": true}
```

---

## Step 7: Test from the Frontend

After ingestion:
1. Open `http://localhost:5173/book/YOUR_BOOK_UUID_HERE`
2. The book detail page should now show an **"🤖 Ask AI about this book"** section
3. Type a question and press Enter
4. You should see a streaming answer with source citations

> **Note:** The AI section only appears after `getBookSummary()` returns data.
> If you see the edge function CORS error, test directly against `localhost:8001`
> by temporarily updating `ai.service.ts` to call `localhost:8001` instead of
> the edge function proxy.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No summary found for book" | Ingestion didn't complete. Check Celery logs. |
| curl hangs on /ingest/upload | Large PDF + slow embeddings. Wait or use smaller file. |
| "Invalid internal API key" | Check the key matches `backend-ai/.env` exactly. |
| CORS error on frontend | Edge function issue. Test with curl first. |
| Empty book_chunks table | Parsing failed. Check if the PDF is valid/readable. |
