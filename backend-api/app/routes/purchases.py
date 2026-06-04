"""
Purchases routes — strict ownership enforcement.

Access rules:
  GET  /purchases/                → Own purchases only (user_id from JWT)
  POST /purchases/orders          → Create Razorpay order for a book
  POST /purchases/verify          → Verify Razorpay payment + mark completed
  GET  /purchases/{purchase_id}   → Own purchase only — IDOR protected
  GET  /purchases/shelf           → Own shelf only (user_id from JWT)
  POST /purchases/shelf           → Add to own shelf
  PATCH /purchases/shelf/{id}     → Own shelf entry only — IDOR protected
  DELETE /purchases/shelf/{id}    → Own shelf entry only — IDOR protected
  GET  /purchases/progress        → Own reading progress (user_id from JWT)
  PUT  /purchases/progress/{book_id} → Own progress only — ownership via book+user

IDOR mitigations:
  - All queries include `user_id == current_user.id` as a mandatory filter.
  - Fetching a purchase/shelf entry by ID always AND's the user_id condition.
  - Amount and user_id are set server-side; clients only supply book_id.
  - Razorpay signature is cryptographically verified with HMAC-SHA256.
"""

import hashlib
import hmac
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.book import Book, BookStatus
from app.models.purchase import (
    Purchase,
    PurchaseStatus,
    ReadingProgress,
    ShelfEntry,
    ShelfType,
)
from app.schemas.book import ReadingProgressUpdate, ShelfEntryCreate, ShelfEntryOut, ShelfEntryUpdate
from app.schemas.purchase import (
    PaymentVerification,
    PurchaseCreate,
    PurchaseOut,
    RazorpayOrderCreate,
    RazorpayOrderOut,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Razorpay HMAC verification ────────────────────────────────────────────────

def _verify_razorpay_signature(
    order_id: str, payment_id: str, signature: str
) -> bool:
    """
    Verify the Razorpay webhook/payment signature using HMAC-SHA256.
    Uses constant-time comparison to prevent timing attacks.
    """
    key_secret = settings.RAZORPAY_KEY_SECRET.encode("utf-8")
    message = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(key_secret, message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Own purchases ─────────────────────────────────────────────────────────────

@router.get("/", response_model=list[PurchaseOut], summary="My purchase history")
async def list_my_purchases(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=24, ge=1, le=100),
):
    """
    Return the authenticated user's purchase history.
    user_id is always taken from the JWT — never from a query parameter.
    """
    result = await db.execute(
        select(Purchase)
        .where(Purchase.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get(
    "/{purchase_id}",
    response_model=PurchaseOut,
    summary="Get a single purchase (owner only)",
)
async def get_purchase(
    purchase_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Fetch a purchase record.
    IDOR: both purchase.id AND purchase.user_id must match — prevents
    a user from reading another user's purchase by guessing the UUID.
    """
    result = await db.execute(
        select(Purchase).where(
            and_(
                Purchase.id == purchase_id,
                Purchase.user_id == current_user.id,  # Ownership check
            )
        )
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase not found.",
        )
    return purchase


# ── Razorpay order creation ───────────────────────────────────────────────────

@router.post(
    "/orders",
    response_model=RazorpayOrderOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Razorpay order for a book",
)
async def create_razorpay_order(
    data: RazorpayOrderCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a Razorpay order for purchasing a book.
    - Amount is read from the book record (not from the client).
    - Free books cannot be ordered via this endpoint.
    - Duplicate purchases are rejected.
    """
    result = await db.execute(
        select(Book).where(
            Book.id == data.book_id,
            Book.status == BookStatus.PUBLISHED,
        )
    )
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found or not published.",
        )

    if book.is_free:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This book is free. Use the free-claim endpoint instead.",
        )

    # Prevent duplicate paid purchases
    existing = await db.execute(
        select(Purchase).where(
            and_(
                Purchase.user_id == current_user.id,
                Purchase.book_id == book.id,
                Purchase.status == PurchaseStatus.COMPLETED,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already purchased this book.",
        )

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment service is not configured.",
        )

    import razorpay
    client = razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )
    amount_paise = int(round(book.price * 100))  # Convert to smallest unit
    rz_order = client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"book_{book.id}_{current_user.id}",
            "payment_capture": 1,
        }
    )

    # Create a PENDING purchase record to track the intent
    pending = Purchase(
        user_id=current_user.id,
        book_id=book.id,
        amount=book.price,           # Amount from book, not client
        currency="INR",
        status=PurchaseStatus.PENDING,
        razorpay_order_id=rz_order["id"],
    )
    db.add(pending)
    await db.commit()

    return RazorpayOrderOut(
        id=rz_order["id"],
        amount=amount_paise,
        currency="INR",
    )


# ── Payment verification ──────────────────────────────────────────────────────

@router.post(
    "/verify",
    response_model=PurchaseOut,
    summary="Verify Razorpay payment",
)
async def verify_payment(
    data: PaymentVerification,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Verify a Razorpay HMAC-SHA256 signature and mark the purchase as completed.
    - The signature is verified cryptographically (constant-time compare).
    - The purchase record is looked up by order_id AND user_id (IDOR prevention).
    - Payment ID uniqueness is enforced at the DB level (unique constraint).
    """
    if not _verify_razorpay_signature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment signature verification failed.",
        )

    # Find the pending purchase by order_id AND current user (IDOR)
    result = await db.execute(
        select(Purchase).where(
            and_(
                Purchase.razorpay_order_id == data.razorpay_order_id,
                Purchase.user_id == current_user.id,       # Ownership check
                Purchase.status == PurchaseStatus.PENDING,
            )
        )
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending purchase not found.",
        )

    purchase.status = PurchaseStatus.COMPLETED
    purchase.razorpay_payment_id = data.razorpay_payment_id
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)
    return purchase


# ── Shelf management ──────────────────────────────────────────────────────────

@router.get(
    "/shelf",
    response_model=list[ShelfEntryOut],
    summary="My reading shelf",
)
async def get_my_shelf(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    shelf: str | None = Query(default=None, max_length=20),
):
    """
    Return the current user's shelf entries.
    Optional filter by shelf type (want_to_read / reading / read).
    """
    query = select(ShelfEntry).where(ShelfEntry.user_id == current_user.id)
    if shelf:
        try:
            shelf_type = ShelfType(shelf.strip().lower())
            query = query.where(ShelfEntry.shelf == shelf_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid shelf type. Must be: want_to_read, reading, or read.",
            )
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/shelf",
    response_model=ShelfEntryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a book to shelf",
)
async def add_to_shelf(
    data: ShelfEntryCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Add a book to the authenticated user's shelf.
    user_id is always taken from the JWT.
    A book can only appear once per user's shelf.
    """
    # Verify book exists and is published
    result = await db.execute(
        select(Book).where(
            Book.id == data.book_id, Book.status == BookStatus.PUBLISHED
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")

    # Duplicate check
    existing = await db.execute(
        select(ShelfEntry).where(
            and_(
                ShelfEntry.user_id == current_user.id,
                ShelfEntry.book_id == data.book_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This book is already on your shelf.",
        )

    entry = ShelfEntry(
        user_id=current_user.id,   # Always server-side
        book_id=data.book_id,
        shelf=ShelfType(data.shelf),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch(
    "/shelf/{entry_id}",
    response_model=ShelfEntryOut,
    summary="Move book to different shelf (owner only)",
)
async def update_shelf_entry(
    entry_id: UUID,
    data: ShelfEntryUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a shelf entry's shelf type.
    IDOR: entry_id AND user_id must match.
    """
    result = await db.execute(
        select(ShelfEntry).where(
            and_(
                ShelfEntry.id == entry_id,
                ShelfEntry.user_id == current_user.id,   # Ownership check
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelf entry not found.")

    entry.shelf = ShelfType(data.shelf)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete(
    "/shelf/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a book from shelf (owner only)",
)
async def remove_from_shelf(
    entry_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Remove a book from the current user's shelf.
    IDOR: entry_id AND user_id must match.
    """
    result = await db.execute(
        select(ShelfEntry).where(
            and_(
                ShelfEntry.id == entry_id,
                ShelfEntry.user_id == current_user.id,   # Ownership check
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shelf entry not found.")

    await db.delete(entry)
    await db.commit()


# ── Reading progress ──────────────────────────────────────────────────────────

@router.get(
    "/progress",
    summary="My reading progress",
)
async def get_my_progress(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return reading progress for all books the current user has interacted with."""
    result = await db.execute(
        select(ReadingProgress).where(ReadingProgress.user_id == current_user.id)
    )
    return result.scalars().all()


@router.put(
    "/progress/{book_id}",
    summary="Update reading progress for a book (owner only)",
)
async def update_reading_progress(
    book_id: UUID,
    data: ReadingProgressUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Upsert reading progress for the current user on a specific book.
    Ownership is enforced: user can only update their own progress.
    A completed purchase is required to track progress.
    """
    # Verify the user has purchased (or claimed) the book
    result = await db.execute(
        select(Purchase).where(
            and_(
                Purchase.user_id == current_user.id,
                Purchase.book_id == book_id,
                Purchase.status == PurchaseStatus.COMPLETED,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must purchase this book before tracking progress.",
        )

    # Upsert progress — always scoped to current_user.id (IDOR safe)
    result = await db.execute(
        select(ReadingProgress).where(
            and_(
                ReadingProgress.user_id == current_user.id,
                ReadingProgress.book_id == book_id,
            )
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        progress.current_page = data.current_page
        progress.percentage = data.percentage
    else:
        progress = ReadingProgress(
            user_id=current_user.id,  # Always server-side
            book_id=book_id,
            current_page=data.current_page,
            percentage=data.percentage,
        )

    db.add(progress)
    await db.commit()
    await db.refresh(progress)
    return progress
