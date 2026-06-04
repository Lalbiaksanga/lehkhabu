"""
Summary route — returns pre-computed book summaries.

GET /summarize/{book_id}
  - Returns the full book summary (from book_summaries table)
  - Falls back to cache if available
  - Query param ?level=chapter returns chapter-level summaries

GET /summarize/{book_id}/chapters
  - Returns all chapter summaries for a book
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import settings
from app.models.chunk import BookSummary
from app.generation.cache import get_summary_cache

router = APIRouter(prefix="/summarize", tags=["summarization"])


def _verify_internal_key(x_internal_key: str = Header(...)):
    """Verify that the request comes from backend-api."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Invalid internal API key")
    return True


@router.get("/{book_id}")
async def get_book_summary(
    book_id: str,
    db: AsyncSession = Depends(get_db),
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Get the full book summary.
    
    First checks the PostgreSQL cache (faster),
    then falls back to the book_summaries table.
    """
    # Try cache first
    cached = await get_summary_cache(db, book_id, "full_book")
    if cached:
        return {
            "book_id": book_id,
            "level": "full_book",
            "summary": cached,
            "cached": True,
        }

    # Fall back to database
    result = await db.execute(
        select(BookSummary).where(
            BookSummary.book_id == book_id,
            BookSummary.level == "full_book",
        )
    )
    summary = result.scalar_one_or_none()

    if not summary:
        raise HTTPException(
            status_code=404,
            detail=f"No summary found for book {book_id}. Has the book been ingested?",
        )

    return {
        "book_id": book_id,
        "level": "full_book",
        "summary": summary.summary_text,
        "cached": False,
    }


@router.get("/{book_id}/chapters")
async def get_chapter_summaries(
    book_id: str,
    db: AsyncSession = Depends(get_db),
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Get all chapter summaries for a book, ordered by chapter_index.
    """
    result = await db.execute(
        select(BookSummary)
        .where(
            BookSummary.book_id == book_id,
            BookSummary.level == "chapter",
        )
        .order_by(BookSummary.chapter_index)
    )
    chapters = result.scalars().all()

    if not chapters:
        raise HTTPException(
            status_code=404,
            detail=f"No chapter summaries found for book {book_id}. Has the book been ingested?",
        )

    return {
        "book_id": book_id,
        "chapters": [
            {
                "chapter_index": ch.chapter_index,
                "chapter_title": ch.chapter_title,
                "summary": ch.summary_text,
            }
            for ch in chapters
        ],
    }
