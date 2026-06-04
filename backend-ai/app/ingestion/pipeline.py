"""
Full pipeline: file URL → parsed document → chunks → embeddings → PostgreSQL.

This runs as a Celery task after book upload. Takes 3-15 minutes depending on book length.
The user sees a progress status updated in the books table.
"""
import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from app.ingestion.parser import parse_from_url, parse_from_file
from app.ingestion.chunker import create_parent_child_chunks
from app.ingestion.embedder import embed_texts_batched
from app.models.chunk import BookChunk, BookSummary
from app.generation.summarize import generate_all_summaries

logger = logging.getLogger(__name__)

# Status values written to the books.ingestion_status column
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"


async def ingest_book(
    db: AsyncSession,
    book_id: str,
    book_title: str,
    file_url: str,
) -> dict:
    """
    Complete ingestion. Returns stats on completion.
    Raises on failure — Celery will retry up to 3 times.
    """
    logger.info(f"[{book_id}] Starting ingestion: {book_title}")

    # Clear any previous ingestion data (handles re-uploads)
    await db.execute(delete(BookChunk).where(BookChunk.book_id == book_id))
    await db.execute(delete(BookSummary).where(BookSummary.book_id == book_id))
    await db.flush()

    # ── PARSE ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Parsing document...")
    parsed = await parse_from_url(file_url)
    logger.info(f"[{book_id}] Parsed {len(parsed.sections)} sections, {parsed.total_pages} pages")

    if not parsed.sections:
        logger.warning(f"[{book_id}] No sections extracted — proceeding with 0 chunks (summary only)")


    # ── CHUNK ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Chunking...")
    chunks = create_parent_child_chunks(parsed.sections)
    logger.info(f"[{book_id}] Created {len(chunks)} parent-child chunk pairs")

    # ── EMBED ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Embedding {len(chunks)} child chunks...")
    child_texts = [c.child_text for c in chunks]
    embeddings = await embed_texts_batched(child_texts)

    # ── STORE ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Saving to PostgreSQL...")
    chunk_records = []
    for chunk, embedding in zip(chunks, embeddings):
        chunk_records.append(BookChunk(
            book_id=book_id,
            chunk_index=chunk.chunk_index,
            page_number=chunk.page_number,
            chapter_title=chunk.chapter_title,
            section_title=chunk.section_title,
            child_text=chunk.child_text,
            parent_text=chunk.parent_text,
            child_token_count=chunk.child_token_count,
            embedding=embedding,
            # search_vector is computed automatically by PostgreSQL
        ))

    # Save in batches of 200 to avoid huge single inserts
    batch_size = 200
    for i in range(0, len(chunk_records), batch_size):
        db.add_all(chunk_records[i: i + batch_size])
        await db.flush()

    logger.info(f"[{book_id}] Saved {len(chunk_records)} chunks")

    # ── SUMMARISE ──────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Generating summaries...")
    await generate_all_summaries(db, book_id, book_title, chunks)

    await db.commit()
    logger.info(f"[{book_id}] Ingestion complete")

    return {
        "book_id": book_id,
        "pages": parsed.total_pages,
        "chunks": len(chunk_records),
        "sections": len(parsed.sections),
    }


async def ingest_book_from_file(
    db: AsyncSession,
    book_id: str,
    book_title: str,
    file_path: str,
) -> dict:
    """
    Ingest a book from a local file path (uploaded via /ingest/upload).
    Same pipeline as ingest_book but skips the download step.
    """
    logger.info(f"[{book_id}] Starting ingestion from local file: {book_title}")

    # Clear any previous ingestion data (handles re-uploads)
    await db.execute(delete(BookChunk).where(BookChunk.book_id == book_id))
    await db.execute(delete(BookSummary).where(BookSummary.book_id == book_id))
    await db.flush()

    # ── PARSE ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Parsing local file...")
    parsed = parse_from_file(file_path)
    logger.info(f"[{book_id}] Parsed {len(parsed.sections)} sections, {parsed.total_pages} pages")

    if not parsed.sections:
        logger.warning(f"[{book_id}] No sections extracted — proceeding with 0 chunks (summary only)")

    # ── CHUNK ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Chunking...")
    chunks = create_parent_child_chunks(parsed.sections)
    logger.info(f"[{book_id}] Created {len(chunks)} parent-child chunk pairs")

    # ── EMBED ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Embedding {len(chunks)} child chunks...")
    child_texts = [c.child_text for c in chunks]
    embeddings = await embed_texts_batched(child_texts)

    # ── STORE ──────────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Saving to PostgreSQL...")
    chunk_records = []
    for chunk, embedding in zip(chunks, embeddings):
        chunk_records.append(BookChunk(
            book_id=book_id,
            chunk_index=chunk.chunk_index,
            page_number=chunk.page_number,
            chapter_title=chunk.chapter_title,
            section_title=chunk.section_title,
            child_text=chunk.child_text,
            parent_text=chunk.parent_text,
            child_token_count=chunk.child_token_count,
            embedding=embedding,
        ))

    batch_size = 200
    for i in range(0, len(chunk_records), batch_size):
        db.add_all(chunk_records[i: i + batch_size])
        await db.flush()

    logger.info(f"[{book_id}] Saved {len(chunk_records)} chunks")

    # ── SUMMARISE ──────────────────────────────────────────────────────────
    logger.info(f"[{book_id}] Generating summaries...")
    await generate_all_summaries(db, book_id, book_title, chunks)

    await db.commit()
    logger.info(f"[{book_id}] Ingestion complete")

    return {
        "book_id": book_id,
        "pages": parsed.total_pages,
        "chunks": len(chunk_records),
        "sections": len(parsed.sections),
    }
