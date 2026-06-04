"""
Strict Pydantic schemas for books, reviews, shelf entries, and reading progress.

Security notes:
  - All string fields have explicit max_length constraints.
  - field_validator decorators reject control characters and sanitise input.
  - Price is validated to be non-negative.
  - Rating is constrained to 1-5 with ge/le.
  - Language codes are validated against ISO 639-1.
  - Colour values must be valid 6-digit hex codes.
  - Tags list is capped at 10 items with per-tag sanitisation.
  - BookUpdate uses model_validator to verify at least one field is provided.
  - Author-controlled fields (author_id, status, slug) are never accepted
    from client input — they are always set server-side.
"""

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ── Shared validator helpers ──────────────────────────────────────────────────

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ISBN_RE = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_LANG_RE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")


def _clean(v: str | None, field: str, max_len: int) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if _CONTROL_CHAR_RE.search(v):
        raise ValueError(f"{field} contains invalid control characters.")
    if len(v) > max_len:
        raise ValueError(f"{field} must not exceed {max_len} characters.")
    return v


# ── Book schemas ─────────────────────────────────────────────────────────────

class BookCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    isbn: Optional[str] = Field(None, max_length=13)
    language: str = Field("en", max_length=5)
    category: str = Field(..., min_length=1, max_length=100)
    tags: list[str] = Field(default_factory=list)
    price: float = Field(0.0, ge=0.0, le=100_000.0)
    is_free: bool = False
    # cover_color_* are set after upload, not at creation time
    cover_color_primary: Optional[str] = Field(None, max_length=7)
    cover_color_secondary: Optional[str] = Field(None, max_length=7)

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("Title contains invalid characters.")
        if not v:
            raise ValueError("Title must not be empty.")
        return v

    @field_validator("description")
    @classmethod
    def clean_description(cls, v: str | None) -> str | None:
        return _clean(v, "description", 5000)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        v = v.strip().lower()
        if not _LANG_RE.match(v):
            raise ValueError(
                "Language must be a valid ISO 639-1 code (e.g. 'en', 'hi')."
            )
        return v

    @field_validator("category")
    @classmethod
    def clean_category(cls, v: str) -> str:
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("Category contains invalid characters.")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags: list[str]) -> list[str]:
        if len(tags) > 10:
            raise ValueError("A maximum of 10 tags are allowed.")
        cleaned = []
        for tag in tags:
            tag = tag.strip().lower()
            if not tag:
                continue
            if _CONTROL_CHAR_RE.search(tag):
                raise ValueError(f"Tag contains invalid characters.")
            if len(tag) > 50:
                raise ValueError("Each tag must be 50 characters or less.")
            cleaned.append(tag)
        return cleaned

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, v: str | None) -> str | None:
        if v is None:
            return None
        normalised = v.strip().replace("-", "").replace(" ", "").upper()
        if not _ISBN_RE.match(normalised):
            raise ValueError(
                "ISBN must be a valid ISBN-10 or ISBN-13 number."
            )
        return normalised

    @field_validator("price")
    @classmethod
    def clean_price(cls, v: float) -> float:
        return round(float(v), 2)

    @field_validator("cover_color_primary", "cover_color_secondary")
    @classmethod
    def validate_hex_color(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not _HEX_COLOR_RE.match(v):
            raise ValueError("Colour must be a 6-digit hex code, e.g. #a1b2c3.")
        return v


class BookUpdate(BaseModel):
    """
    Partial update — all fields optional.
    Status, author_id, and slug are NOT updatable via this schema;
    they are controlled server-side only.
    """
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    isbn: Optional[str] = Field(None, max_length=13)
    language: Optional[str] = Field(None, max_length=5)
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[list[str]] = None
    price: Optional[float] = Field(None, ge=0.0, le=100_000.0)
    is_free: Optional[bool] = None
    cover_color_primary: Optional[str] = Field(None, max_length=7)
    cover_color_secondary: Optional[str] = Field(None, max_length=7)
    total_pages: Optional[int] = Field(None, ge=0, le=100_000)
    word_count: Optional[int] = Field(None, ge=0, le=10_000_000)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "BookUpdate":
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for an update.")
        return self

    # Reuse the same validators from BookCreate
    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str | None) -> str | None:
        return _clean(v, "title", 500)

    @field_validator("description")
    @classmethod
    def clean_description(cls, v: str | None) -> str | None:
        return _clean(v, "description", 5000)

    @field_validator("category")
    @classmethod
    def clean_category(cls, v: str | None) -> str | None:
        return _clean(v, "category", 100)

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not _LANG_RE.match(v):
            raise ValueError("Language must be a valid ISO 639-1 code.")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags: list[str] | None) -> list[str] | None:
        if tags is None:
            return None
        if len(tags) > 10:
            raise ValueError("A maximum of 10 tags are allowed.")
        cleaned = []
        for tag in tags:
            tag = tag.strip().lower()
            if tag and len(tag) <= 50:
                cleaned.append(tag)
        return cleaned

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, v: str | None) -> str | None:
        if v is None:
            return None
        normalised = v.strip().replace("-", "").replace(" ", "").upper()
        if not _ISBN_RE.match(normalised):
            raise ValueError("ISBN must be a valid ISBN-10 or ISBN-13 number.")
        return normalised

    @field_validator("price")
    @classmethod
    def clean_price(cls, v: float | None) -> float | None:
        return round(float(v), 2) if v is not None else None

    @field_validator("cover_color_primary", "cover_color_secondary")
    @classmethod
    def validate_hex_color(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not _HEX_COLOR_RE.match(v.strip()):
            raise ValueError("Colour must be a 6-digit hex code, e.g. #a1b2c3.")
        return v.strip()


class BookOut(BaseModel):
    id: uuid.UUID
    slug: str
    author_id: uuid.UUID
    title: str
    description: Optional[str] = None
    isbn: Optional[str] = None
    language: str
    category: str
    tags: list[str] = []
    price: float
    is_free: bool
    status: str
    cover_image_url: Optional[str] = None
    file_url: Optional[str] = None
    cover_color_primary: Optional[str] = None
    cover_color_secondary: Optional[str] = None
    total_pages: Optional[int] = None
    word_count: Optional[int] = None
    average_rating: float
    rating_count: int
    purchase_count: int
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Review schemas ────────────────────────────────────────────────────────────

class ReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: Optional[str] = Field(None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, v: str | None) -> str | None:
        return _clean(v, "comment", 2000)


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, v: str | None) -> str | None:
        return _clean(v, "comment", 2000)

    @model_validator(mode="after")
    def at_least_one(self) -> "ReviewUpdate":
        if self.rating is None and self.comment is None:
            raise ValueError("At least one of rating or comment must be provided.")
        return self


class ReviewOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    book_id: uuid.UUID
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Shelf entry schemas ───────────────────────────────────────────────────────

_VALID_SHELVES = {"want_to_read", "reading", "read"}


class ShelfEntryCreate(BaseModel):
    book_id: uuid.UUID
    shelf: str = Field(..., description="One of: want_to_read, reading, read")

    @field_validator("shelf")
    @classmethod
    def validate_shelf(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in _VALID_SHELVES:
            raise ValueError(
                f"shelf must be one of: {', '.join(sorted(_VALID_SHELVES))}."
            )
        return v


class ShelfEntryUpdate(BaseModel):
    shelf: str = Field(..., description="One of: want_to_read, reading, read")

    @field_validator("shelf")
    @classmethod
    def validate_shelf(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in _VALID_SHELVES:
            raise ValueError(
                f"shelf must be one of: {', '.join(sorted(_VALID_SHELVES))}."
            )
        return v


class ShelfEntryOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    book_id: uuid.UUID
    shelf: str
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Reading progress schemas ──────────────────────────────────────────────────

class ReadingProgressUpdate(BaseModel):
    current_page: int = Field(..., ge=0, le=100_000)
    percentage: float = Field(..., ge=0.0, le=100.0)

    @field_validator("percentage")
    @classmethod
    def round_percentage(cls, v: float) -> float:
        return round(v, 2)
