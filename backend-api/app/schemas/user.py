"""
Strict Pydantic schemas for user profile updates.

Security notes:
  - Role, is_active, and is_email_verified are NEVER updatable by users.
    They are server-side / admin-only fields.
  - bio and full_name are length-capped and control-char sanitised.
  - avatar_url and profile_bg_url are URL-validated (http/https only).
  - social_links keys and values are allowlisted.
  - UserOut never exposes hashed_password, security tokens, or lockout fields.
"""

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from urllib.parse import urlparse


_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ALLOWED_URL_SCHEMES = {"http", "https"}
_ALLOWED_SOCIAL_KEYS = {"twitter", "instagram", "linkedin", "github", "website", "facebook"}


def _safe_url(v: str | None, field: str) -> str | None:
    if v is None:
        return None
    v = v.strip()
    parsed = urlparse(v)
    if parsed.scheme not in _ALLOWED_URL_SCHEMES:
        raise ValueError(
            f"{field} must use http or https (got {parsed.scheme!r})."
        )
    if not parsed.netloc:
        raise ValueError(f"{field} is not a valid URL.")
    if len(v) > 2000:
        raise ValueError(f"{field} URL is too long.")
    return v


# ── Read-only output ──────────────────────────────────────────────────────────

class UserOut(BaseModel):
    """
    Public-facing user representation.
    CRITICAL: hashed_password, email_verification_token, password_reset_token,
    failed_login_attempts, locked_until are intentionally excluded.
    """
    id: uuid.UUID
    email: str
    username: str
    full_name: str
    role: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool
    is_email_verified: bool
    following_count: int
    followers_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Update schemas ────────────────────────────────────────────────────────────

class UserUpdateSelf(BaseModel):
    """
    Fields a user may update on their OWN profile.
    Role, is_active, is_email_verified, and all security fields
    are intentionally absent — they cannot be changed via this schema.
    """
    full_name: Optional[str] = Field(None, max_length=200)
    bio: Optional[str] = Field(None, max_length=1000)
    avatar_url: Optional[str] = Field(None, max_length=2000)
    profile_bg_url: Optional[str] = Field(None, max_length=2000)
    is_public_library: Optional[bool] = None
    social_links: Optional[dict[str, str]] = None

    @model_validator(mode="after")
    def at_least_one(self) -> "UserUpdateSelf":
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided.")
        return self

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("full_name contains invalid characters.")
        return v

    @field_validator("bio")
    @classmethod
    def clean_bio(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("bio contains invalid characters.")
        return v

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        return _safe_url(v, "avatar_url")

    @field_validator("profile_bg_url")
    @classmethod
    def validate_bg_url(cls, v: str | None) -> str | None:
        return _safe_url(v, "profile_bg_url")

    @field_validator("social_links")
    @classmethod
    def validate_social_links(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is None:
            return None
        if len(v) > 6:
            raise ValueError("A maximum of 6 social links are allowed.")
        validated: dict[str, str] = {}
        for key, url in v.items():
            key = key.strip().lower()
            if key not in _ALLOWED_SOCIAL_KEYS:
                raise ValueError(
                    f"Unknown social link key {key!r}. "
                    f"Allowed: {', '.join(sorted(_ALLOWED_SOCIAL_KEYS))}."
                )
            validated[key] = _safe_url(url, f"social_links[{key}]") or ""
        return validated


class ChangePasswordRequest(BaseModel):
    """Authenticated password change (requires current password)."""
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        import re as _re
        if not _re.search(r"[A-Z]", v):
            raise ValueError("New password must contain at least one uppercase letter.")
        if not _re.search(r"[a-z]", v):
            raise ValueError("New password must contain at least one lowercase letter.")
        if not _re.search(r"\d", v):
            raise ValueError("New password must contain at least one digit.")
        if not _re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", v):
            raise ValueError("New password must contain at least one special character.")
        return v


# ── Author profile schemas ────────────────────────────────────────────────────

class AuthorProfileBase(BaseModel):
    pen_name: Optional[str] = Field(None, max_length=200)
    website: Optional[str] = Field(None, max_length=2000)
    social_links: Optional[str] = Field(None, max_length=1000)


class AuthorProfileOut(AuthorProfileBase):
    id: uuid.UUID
    total_books: int
    total_sales: int

    model_config = ConfigDict(from_attributes=True)


class AuthorApplicationCreate(BaseModel):
    writing_sample: str = Field(..., min_length=50, max_length=5000)
    motivation: str = Field(..., min_length=50, max_length=2000)
    genre: str = Field(..., min_length=2, max_length=100)
    social_links: Optional[str] = Field(None, max_length=500)

    @field_validator("writing_sample", "motivation")
    @classmethod
    def clean_text(cls, v: str) -> str:
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("Field contains invalid characters.")
        return v

    @field_validator("genre")
    @classmethod
    def clean_genre(cls, v: str) -> str:
        v = v.strip()
        if _CONTROL_CHAR_RE.search(v):
            raise ValueError("Genre contains invalid characters.")
        return v


class AuthorApplicationOut(AuthorApplicationCreate):
    id: uuid.UUID
    status: str
    admin_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)
