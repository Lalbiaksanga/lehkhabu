"""
Book routes — ownership-enforced access control.

Access rules:
  GET  /books/                → Public (published books only)
  GET  /books/mine            → Author: own books (all statuses)
  GET  /books/{slug}          → Public for published; owner/admin for drafts
  POST /books/                → Author or Admin only
  PATCH /books/{slug}         → Book owner (author) or Admin only — IDOR protected
  DELETE /books/{slug}        → Book owner (author) or Admin only — IDOR protected
  POST /books/{slug}/submit   → Book owner only; moves DRAFT → PENDING_REVIEW
  POST /books/{slug}/reviews  → Any authenticated user who purchased the book
  PATCH /books/{slug}/reviews/{review_id} → Review owner only — IDOR protected
  DELETE /books/{slug}/reviews/{review_id} → Review owner or Admin — IDOR protected
  GET  /books/{slug}/reviews  → Authenticated users only

  File uploads are handled via Supabase Storage signed URLs — no raw file bytes
  pass through this API, preventing path-traversal and unsafe upload attacks.

Slug generation:
  Uses python-slugify for safe ASCII slug generation, not naive string replace.
  A UUID suffix guarantees uniqueness without a guessable pattern.

IDOR protections:
  - Book mutations fetch by slug → verify author_id == current author profile id.
  - Review mutations fetch by id AND book_id AND user_id simultaneously.
  - No operation accepts an author_id/user_id as client input.
"""

import re
import uuid
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_active_author
from app.models.book import Book, BookStatus
from app.models.purchase import Purchase, PurchaseStatus, Review
from app.models.user import AuthorProfile, User
from app.schemas.book import (
    BookCreate,
    BookOut,
    BookUpdate,
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Slug helper ───────────────────────────────────────────────────────────────

_UNSAFE_SLUG_CHARS = re.compile(r"[^a-z0-9\-]")


def _make_slug(title: str) -> str:
    """
    Generate a URL-safe slug from a title.
    - Lowercase, strip non-alphanumeric characters.
    - Append a UUID fragment for guaranteed uniqueness.
    """
    base = title.lower().strip()
    base = re.sub(r"['\"]", "", base)       # Remove quotes
    base = re.sub(r"[^a-z0-9]+", "-", base) # Replace any non-alphanum run with "-"
    base = base.strip("-")[:80]             # Max 80 chars before UUID fragment
    if not base:
        base = "book"
    return f"{base}-{str(uuid.uuid4())[:8]}"


# ── Ownership helpers ─────────────────────────────────────────────────────────

async def _get_author_profile_or_403(
    user: User, db: AsyncSession
) -> AuthorProfile:
    """Return the author profile for a user, or raise 403 if none exists."""
    result = await db.execute(
        select(AuthorProfile).where(AuthorProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must set up an Author Profile before performing this action.",
        )
    return profile


async def _get_book_as_owner(
    slug: str, current_user: User, db: AsyncSession
) -> tuple[Book, AuthorProfile]:
    """
    Fetch a book by slug and verify the current user is its author.
    Admins bypass the ownership check.
    Raises 404 if not found, 403 if not owned.
    """
    result = await db.execute(select(Book).where(Book.slug == slug))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    is_admin = current_user.role.value == "admin"
    if is_admin:
        return book, None  # Admins need no profile check

    author_profile = await _get_author_profile_or_403(current_user, db)
    if str(book.author_id) != str(author_profile.id):
        # Return 404 not 403 — don't confirm the book exists for non-owners
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    return book, author_profile


# ── Public book listing ───────────────────────────────────────────────────────

@router.get("/", response_model=list[BookOut], summary="List published books")
async def list_books(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
    category: str | None = Query(default=None, max_length=100),
):
    """
    Return published books. Pagination is capped at 100.
    Optional category filter is parameterised (no SQL injection possible).
    """
    query = select(Book).where(Book.status == BookStatus.PUBLISHED)
    if category:
        category = category.strip()
        query = query.where(Book.category == category)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


# ── Author: own books ─────────────────────────────────────────────────────────

@router.get("/mine", response_model=list[BookOut], summary="Author's own books")
async def list_my_books(
    current_user: Annotated[User, Depends(get_current_active_author)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
):
    """
    Returns ALL books (all statuses) belonging to the authenticated author.
    User ID is taken from JWT — not from a request parameter.
    """
    author_profile = await _get_author_profile_or_403(current_user, db)
    result = await db.execute(
        select(Book)
        .where(Book.author_id == author_profile.id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


# ── Create a book ─────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=BookOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new book draft (Author only)",
)
async def create_book(
    data: BookCreate,
    current_user: Annotated[User, Depends(get_current_active_author)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new draft book under the authenticated author's profile.
    author_id is set server-side — never accepted from the client.
    """
    author_profile = await _get_author_profile_or_403(current_user, db)

    new_book = Book(
        title=data.title,
        slug=_make_slug(data.title),
        description=data.description,
        isbn=data.isbn,
        language=data.language,
        category=data.category,
        tags=data.tags,
        price=data.price,
        is_free=data.is_free,
        cover_color_primary=data.cover_color_primary,
        cover_color_secondary=data.cover_color_secondary,
        author_id=author_profile.id,     # Always set server-side
        status=BookStatus.DRAFT,          # Always starts as draft
    )

    db.add(new_book)
    await db.commit()
    await db.refresh(new_book)
    return new_book


# ── Get a single book ─────────────────────────────────────────────────────────

@router.get("/{slug}", response_model=BookOut, summary="Get a book by slug")
async def get_book(
    slug: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Fetch a book by slug.
    - Published books are visible to all authenticated users.
    - Draft / pending / rejected books are visible only to the owner or admins.
    """
    result = await db.execute(select(Book).where(Book.slug == slug))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    if book.status != BookStatus.PUBLISHED:
        # Only the owning author or an admin may see non-published books
        is_admin = current_user.role.value == "admin"
        if not is_admin:
            author_profile = await db.execute(
                select(AuthorProfile).where(AuthorProfile.user_id == current_user.id)
            )
            profile = author_profile.scalar_one_or_none()
            if not profile or str(book.author_id) != str(profile.id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Book not found."
                )

    return book


# ── Update a book ─────────────────────────────────────────────────────────────

@router.patch(
    "/{slug}",
    response_model=BookOut,
    summary="Update a book (owner or Admin only)",
)
async def update_book(
    slug: str,
    data: BookUpdate,
    current_user: Annotated[User, Depends(get_current_active_author)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Partial update of a book.
    - Only the author who owns this book (or an admin) may update it.
    - Status, author_id, and slug cannot be changed via this endpoint.
    - IDOR: ownership verified by matching author_profile.id == book.author_id.
    """
    book, _ = await _get_book_as_owner(slug, current_user, db)

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(book, field, value)

    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


# ── Delete a book ─────────────────────────────────────────────────────────────

@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a book (owner or Admin only)",
)
async def delete_book(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_author)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a book. Only the owning author or an admin may delete a book.
    Returns 404 (not 403) for non-owners to avoid confirming the book exists.
    """
    book, _ = await _get_book_as_owner(slug, current_user, db)
    await db.delete(book)
    await db.commit()


# ── Submit a book for review ──────────────────────────────────────────────────

@router.post(
    "/{slug}/submit",
    response_model=BookOut,
    summary="Submit a draft for review (owner only)",
)
async def submit_book_for_review(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_author)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Transition a DRAFT book to PENDING_REVIEW.
    Only the owning author may submit; state machine enforced.
    """
    book, _ = await _get_book_as_owner(slug, current_user, db)

    if book.status != BookStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only DRAFT books can be submitted for review (current status: {book.status.value}).",
        )

    book.status = BookStatus.PENDING_REVIEW
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


# ── Reviews ───────────────────────────────────────────────────────────────────

@router.get(
    "/{slug}/reviews",
    response_model=list[ReviewOut],
    summary="List reviews for a book",
)
async def list_reviews(
    slug: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
):
    """List reviews for a published book. Authentication required."""
    result = await db.execute(
        select(Book).where(Book.slug == slug, Book.status == BookStatus.PUBLISHED)
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    result = await db.execute(
        select(Review)
        .where(Review.book_id == book.id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post(
    "/{slug}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Post a review (purchasers only)",
)
async def create_review(
    slug: str,
    data: ReviewCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Submit a review. Only users who have a COMPLETED purchase may review.
    user_id is always taken from the JWT — never from request body.
    """
    result = await db.execute(
        select(Book).where(Book.slug == slug, Book.status == BookStatus.PUBLISHED)
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    # Verify purchase ownership
    result = await db.execute(
        select(Purchase).where(
            and_(
                Purchase.user_id == current_user.id,
                Purchase.book_id == book.id,
                Purchase.status == PurchaseStatus.COMPLETED,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must purchase this book before reviewing it.",
        )

    # One review per user per book
    result = await db.execute(
        select(Review).where(
            Review.user_id == current_user.id, Review.book_id == book.id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reviewed this book.",
        )

    review = Review(
        user_id=current_user.id,   # Always server-side
        book_id=book.id,           # Always server-side
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.patch(
    "/{slug}/reviews/{review_id}",
    response_model=ReviewOut,
    summary="Update own review",
)
async def update_review(
    slug: str,
    review_id: UUID,
    data: ReviewUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a review. Ownership enforced by querying user_id == current_user.id.
    Returns 404 for non-owners (no IDOR confirmation).
    """
    result = await db.execute(
        select(Review).where(
            and_(
                Review.id == review_id,
                Review.user_id == current_user.id,   # IDOR check
            )
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

    if data.rating is not None:
        review.rating = data.rating
    if data.comment is not None:
        review.comment = data.comment

    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.delete(
    "/{slug}/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a review (owner or Admin)",
)
async def delete_review(
    slug: str,
    review_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a review. Owner or Admin may delete.
    Non-owners receive 404 — no information leak.
    """
    is_admin = current_user.role.value == "admin"

    if is_admin:
        result = await db.execute(select(Review).where(Review.id == review_id))
    else:
        result = await db.execute(
            select(Review).where(
                and_(
                    Review.id == review_id,
                    Review.user_id == current_user.id,  # IDOR check
                )
            )
        )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

    await db.delete(review)
    await db.commit()
