"""
Celery tasks for book ingestion and cache maintenance.

These tasks run in a separate Celery worker process.
They use asyncio.run() to bridge Celery's sync world with our async pipeline.

IMPORTANT — why we create a fresh engine per task:
asyncpg connection pools are bound to the event loop that created them.
The module-level `async_session` in database.py is created at import time
on whatever loop exists then. When Celery calls asyncio.run(), it creates a
brand new event loop, and asyncpg raises:
    RuntimeError: Future attached to a different loop

Fix: create a new SQLAlchemy async engine + session factory inside each
asyncio.run() call (i.e. inside the new event loop), then dispose it after.
This is cheap — connection setup is fast for a local PostgreSQL server.
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.worker.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


def _make_session() -> tuple:
    """
    Create a fresh async engine and session factory for this event loop.
    Returns (engine, session_factory) — caller must dispose the engine after use.
    """
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        # Use a small pool — each task creates its own engine, so keep low
        pool_size=2,
        max_overflow=0,
        connect_args={
            "server_settings": {"search_path": "lehkhabu,public"}
        },
    )
    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return engine, session_factory


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.worker.book_tasks.ingest_book_task",
)
def ingest_book_task(self, book_id: str, book_title: str, file_url: str) -> dict:
    """
    Celery task that wraps the async ingestion pipeline.

    Called from the /ingest route. Runs in a Celery worker process.
    Retries up to 3 times on failure with 60-second delay.
    """
    try:
        logger.info(f"[Celery] Starting ingest task for {book_id}: {book_title}")
        result = asyncio.run(_run_ingestion(book_id, book_title, file_url))
        logger.info(f"[Celery] Ingestion complete for {book_id}: {result}")
        return result
    except Exception as exc:
        logger.error(f"[Celery] Ingestion failed for {book_id}: {exc}")
        raise self.retry(exc=exc)


async def _run_ingestion(book_id: str, book_title: str, file_url: str) -> dict:
    """Run the async ingestion pipeline inside a fresh engine/session."""
    from app.ingestion.pipeline import ingest_book

    engine, session_factory = _make_session()
    try:
        async with session_factory() as db:
            try:
                result = await ingest_book(db, book_id, book_title, file_url)
                return result
            except Exception:
                await db.rollback()
                raise
    finally:
        await engine.dispose()


@celery_app.task(name="app.worker.book_tasks.cleanup_expired_cache")
def cleanup_expired_cache() -> dict:
    """
    Periodic task: delete expired ai_cache rows.
    Runs every hour via Celery Beat.
    """
    try:
        count = asyncio.run(_run_cleanup())
        logger.info(f"[Celery] Cleaned up {count} expired cache rows")
        return {"deleted": count}
    except Exception as exc:
        logger.error(f"[Celery] Cache cleanup failed: {exc}")
        return {"error": str(exc)}


async def _run_cleanup() -> int:
    """Run the async cleanup inside a fresh engine/session."""
    from app.generation.cache import cleanup_expired_rows

    engine, session_factory = _make_session()
    try:
        async with session_factory() as db:
            return await cleanup_expired_rows(db)
    finally:
        await engine.dispose()
