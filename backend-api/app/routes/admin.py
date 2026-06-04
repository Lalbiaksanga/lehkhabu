"""
Admin-only routes for internal platform management.

Access: all endpoints require a valid JWT from a user with role=ADMIN.

Endpoints:
  GET  /admin/stats          → Platform health & aggregate counts
  GET  /admin/books/pending  → Books awaiting review (PENDING_REVIEW status)
  PATCH /admin/books/{slug}/approve  → Approve a book (PENDING_REVIEW → PUBLISHED)
  PATCH /admin/books/{slug}/reject   → Reject a book  (PENDING_REVIEW → REJECTED)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentAdmin
from app.models.book import Book, BookStatus
from app.models.purchase import Purchase, PurchaseStatus
from app.models.user import User, UserRole
from app.schemas.book import BookOut

router = APIRouter()


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get(
    "/stats",
    summary="[Admin] Platform aggregate stats",
)
async def get_platform_stats(
    _: CurrentAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Return aggregate counts for platform monitoring.
    Only accessible to ADMIN users.
    """
    # Run all count queries in parallel using a single round-trip
    results = await db.execute(
        select(
            func.count(User.id).label("total_users"),
            func.count(User.id).filter(User.role == UserRole.AUTHOR).label("total_authors"),
            func.count(User.id).filter(User.is_active == False).label("suspended_users"),  # noqa: E712
        )
    )
    user_row = results.one()

    books_result = await db.execute(
        select(
            func.count(Book.id).label("total_books"),
            func.count(Book.id).filter(Book.status == BookStatus.PUBLISHED).label("published_books"),
            func.count(Book.id).filter(Book.status == BookStatus.PENDING_REVIEW).label("pending_books"),
        )
    )
    book_row = books_result.one()

    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Purchase.amount), 0))
        .where(Purchase.status == PurchaseStatus.COMPLETED)
    )
    total_revenue = float(revenue_result.scalar() or 0)

    return {
        "status": "online",
        "users": {
            "total": user_row.total_users,
            "authors": user_row.total_authors,
            "suspended": user_row.suspended_users,
        },
        "books": {
            "total": book_row.total_books,
            "published": book_row.published_books,
            "pending_review": book_row.pending_books,
        },
        "revenue_inr": total_revenue,
    }


# ── Book moderation ───────────────────────────────────────────────────────────

@router.get(
    "/books/pending",
    response_model=list[BookOut],
    summary="[Admin] List books awaiting review",
)
async def list_pending_books(
    _: CurrentAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Return all books currently in PENDING_REVIEW status, ordered by creation date.
    """
    result = await db.execute(
        select(Book)
        .where(Book.status == BookStatus.PENDING_REVIEW)
        .order_by(Book.created_at.asc())
    )
    return result.scalars().all()


@router.patch(
    "/books/{slug}/approve",
    response_model=BookOut,
    summary="[Admin] Approve a book for publication",
)
async def approve_book(
    slug: str,
    _: CurrentAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Transition a book from PENDING_REVIEW → PUBLISHED.
    Sets published_at to the current timestamp.
    """
    from datetime import datetime, timezone  # local import — keeps top level clean

    result = await db.execute(select(Book).where(Book.slug == slug))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    if book.status != BookStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only PENDING_REVIEW books can be approved (current: {book.status.value}).",
        )

    book.status = BookStatus.PUBLISHED
    book.published_at = datetime.now(timezone.utc)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


@router.patch(
    "/books/{slug}/reject",
    response_model=BookOut,
    summary="[Admin] Reject a book",
)
async def reject_book(
    slug: str,
    _: CurrentAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Transition a book from PENDING_REVIEW → REJECTED.
    The author may revise and resubmit from REJECTED status.
    """
    result = await db.execute(select(Book).where(Book.slug == slug))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    if book.status != BookStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only PENDING_REVIEW books can be rejected (current: {book.status.value}).",
        )

    book.status = BookStatus.REJECTED
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book
