from __future__ import annotations

"""
PostgreSQL-backed AI response cache.
Replaces Redis. Same interface — just reads/writes to the ai_cache table.

How TTL works:
- On write: set expires_at = NOW() + interval
- On read: only return row if expires_at > NOW()
- Cleanup: Celery beat task deletes expired rows every hour
"""
import hashlib
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func

from app.models.chunk import AICache


def _make_cache_key(prefix: str, book_id: str, content: str) -> str:
    """Generate a deterministic cache key from the inputs."""
    content_hash = hashlib.sha256(
        (content.lower().strip()).encode("utf-8")
    ).hexdigest()
    return f"{prefix}:{book_id}:{content_hash}"


async def get_cached_response(
    db: AsyncSession,
    book_id: str,
    question: str,
    prefix: str = "qa",
) -> str | None:
    """
    Check if we have a cached answer for this question.
    Returns None if not cached or expired.
    """
    key = _make_cache_key(prefix, book_id, question)

    result = await db.execute(
        select(AICache).where(
            AICache.cache_key == key,
            AICache.expires_at > func.now(),  # only valid (non-expired) rows
        )
    )
    row = result.scalar_one_or_none()

    if row:
        # Update hit stats (fire-and-forget, don't fail if this errors)
        try:
            await db.execute(
                update(AICache)
                .where(AICache.id == row.id)
                .values(
                    hit_count=AICache.hit_count + 1,
                    last_hit=func.now(),
                )
            )
        except Exception:
            pass
        return row.response_text

    return None


async def set_cached_response(
    db: AsyncSession,
    book_id: str,
    question: str,
    response: str,
    ttl_hours: int = 24,
    prefix: str = "qa",
) -> None:
    """
    Cache an AI response.
    ttl_hours=24 for Q&A, ttl_hours=168 (7 days) for summaries.
    """
    key = _make_cache_key(prefix, book_id, question)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)

    # Check for existing row to upsert
    existing = await db.execute(select(AICache).where(AICache.cache_key == key))
    row = existing.scalar_one_or_none()

    if row:
        # Update existing (e.g., if content changed after re-ingestion)
        row.response_text = response
        row.expires_at = expires_at
        row.hit_count = 0
    else:
        db.add(AICache(
            cache_key=key,
            response_text=response,
            expires_at=expires_at,
        ))

    await db.flush()


async def get_summary_cache(
    db: AsyncSession,
    book_id: str,
    level: str = "full_book",
) -> str | None:
    """Convenience wrapper for summary caching."""
    return await get_cached_response(db, book_id, level, prefix="summary")


async def set_summary_cache(
    db: AsyncSession,
    book_id: str,
    level: str,
    summary: str,
) -> None:
    """Cache a summary for 7 days."""
    await set_cached_response(
        db, book_id, level, summary, ttl_hours=168, prefix="summary"
    )


async def cleanup_expired_rows(db: AsyncSession) -> int:
    """Delete expired cache rows. Called by Celery beat every hour."""
    result = await db.execute(
        delete(AICache).where(AICache.expires_at <= func.now())
    )
    await db.commit()
    return result.rowcount
