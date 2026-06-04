import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    USER = "user"
    AUTHOR = "author"
    ADMIN = "admin"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="userrole"), default=UserRole.USER, nullable=False
    )
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_bg_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Social
    following_count: Mapped[int] = mapped_column(default=0, nullable=False)
    followers_count: Mapped[int] = mapped_column(default=0, nullable=False)
    social_links: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    is_public_library: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Supabase auth UID (optional – for cases where Supabase handles login)
    supabase_uid: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    # ── Security fields ───────────────────────────────
    # Email verification: raw token is sent to user; only its SHA-256 hash is stored.
    email_verification_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_verification_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Password reset: same hash-before-store pattern.
    password_reset_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_reset_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Brute-force / account lockout
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    # ── Relationships ─────────────────────────────────
    author_profile: Mapped["AuthorProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    purchases: Mapped[list["Purchase"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    shelf_entries: Mapped[list["ShelfEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reading_progress: Mapped[list["ReadingProgress"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reading_challenges: Mapped[list["ReadingChallenge"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    author_applications: Mapped[list["AuthorApplication"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"


class AuthorProfile(Base):
    __tablename__ = "author_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    pen_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    social_links: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    total_books: Mapped[int] = mapped_column(default=0, nullable=False)
    total_sales: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="author_profile")
    books: Mapped[list["Book"]] = relationship(back_populates="author")
