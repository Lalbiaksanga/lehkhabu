import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    ARRAY,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import utcnow


class BookStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ARCHIVED = "archived"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("author_profiles.id", ondelete="CASCADE"), nullable=False
    )

    # Core metadata
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(600), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    # Category / discovery
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)

    # Files (Supabase Storage paths)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)   # epub/pdf
    cover_color_primary: Mapped[str | None] = mapped_column(String(7), nullable=True)
    cover_color_secondary: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # Pricing
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Content info
    total_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Aggregated stats (denormalised for speed)
    average_rating: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    purchase_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[BookStatus] = mapped_column(
        Enum(BookStatus, name="bookstatus"), default=BookStatus.DRAFT, nullable=False
    )

    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    # ── Relationships ─────────────────────────────
    author: Mapped["AuthorProfile"] = relationship(back_populates="books")  # type: ignore[name-defined]
    purchases: Mapped[list["Purchase"]] = relationship(back_populates="book")
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )
    shelf_entries: Mapped[list["ShelfEntry"]] = relationship(back_populates="book")
    reading_progress: Mapped[list["ReadingProgress"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Book id={self.id} title={self.title!r} status={self.status}>"
