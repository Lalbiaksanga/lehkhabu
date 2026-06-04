# Import all models here so Alembic can discover them
from app.models.user import User, AuthorProfile, UserRole
from app.models.book import Book, BookStatus
from app.models.purchase import (
    Purchase,
    Review,
    ShelfEntry,
    ReadingProgress,
    ReadingChallenge,
    AuthorApplication,
    Announcement,
    PurchaseStatus,
    ShelfType,
    AuthorApplicationStatus,
)

__all__ = [
    "User",
    "AuthorProfile",
    "UserRole",
    "Book",
    "BookStatus",
    "Purchase",
    "Review",
    "ShelfEntry",
    "ReadingProgress",
    "ReadingChallenge",
    "AuthorApplication",
    "Announcement",
    "PurchaseStatus",
    "ShelfType",
    "AuthorApplicationStatus",
]
