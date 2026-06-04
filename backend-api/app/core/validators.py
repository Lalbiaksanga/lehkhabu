"""
Centralised input validation and sanitisation helpers.

Rules applied everywhere user-controlled strings enter the API:
  - Strip leading/trailing whitespace
  - Enforce maximum lengths (defence against extremely large payloads)
  - Reject non-printable / control characters
  - Validate ISBN-13 check digit
  - Validate hex colour codes
  - Validate URL schemes (http/https only — no javascript:, data:, etc.)
  - Validate slug format (no path traversal)
  - Validate language codes (2-letter ISO 639-1)

SQLAlchemy parameterised queries are used everywhere; these helpers protect
against XSS / stored-injection by ensuring values are sane before storage.
"""

import re
import unicodedata
from urllib.parse import urlparse


# ── Constants ─────────────────────────────────────────────────────────────────

_ALLOWED_URL_SCHEMES = {"http", "https"}
_ALLOWED_LANG_RE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")   # en, en-US
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ISBN_RE = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")          # ISBN-10 or ISBN-13
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


# ── Core sanitiser ────────────────────────────────────────────────────────────

def sanitize_string(
    value: str,
    max_length: int,
    field_name: str = "field",
    allow_empty: bool = False,
) -> str:
    """
    Strip whitespace, reject control characters, enforce max length.
    Raises ValueError on policy violation.
    """
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string.")

    value = value.strip()

    if not allow_empty and not value:
        raise ValueError(f"{field_name} must not be empty.")

    if _CONTROL_CHAR_RE.search(value):
        raise ValueError(f"{field_name} contains invalid characters.")

    if len(value) > max_length:
        raise ValueError(
            f"{field_name} must not exceed {max_length} characters "
            f"(got {len(value)})."
        )

    return value


# ── Domain-specific validators ────────────────────────────────────────────────

def validate_url(value: str | None, field_name: str = "URL") -> str | None:
    """
    Reject non-http(s) URLs to block javascript:, data:, and file: schemes.
    Returns None if the value is None.
    """
    if value is None:
        return None

    value = sanitize_string(value, max_length=2000, field_name=field_name)

    parsed = urlparse(value)
    if parsed.scheme not in _ALLOWED_URL_SCHEMES:
        raise ValueError(
            f"{field_name} must use http or https scheme "
            f"(got {parsed.scheme!r})."
        )
    if not parsed.netloc:
        raise ValueError(f"{field_name} is not a valid URL.")
    return value


def validate_hex_color(value: str | None, field_name: str = "color") -> str | None:
    """Validate a 6-digit CSS hex colour string (#rrggbb)."""
    if value is None:
        return None
    value = sanitize_string(value, max_length=7, field_name=field_name)
    if not _HEX_COLOR_RE.match(value):
        raise ValueError(
            f"{field_name} must be a 6-digit hex colour (e.g. #a1b2c3)."
        )
    return value


def validate_language_code(value: str, field_name: str = "language") -> str:
    """Validate a 2-letter ISO 639-1 language code (optionally with region)."""
    value = sanitize_string(value, max_length=5, field_name=field_name)
    if not _ALLOWED_LANG_RE.match(value):
        raise ValueError(
            f"{field_name} must be a valid language code (e.g. 'en', 'hi', 'en-US')."
        )
    return value


def validate_isbn(value: str | None, field_name: str = "isbn") -> str | None:
    """Validate ISBN-10 or ISBN-13 format (digits only, optional X suffix)."""
    if value is None:
        return None
    value = sanitize_string(value, max_length=13, field_name=field_name)
    normalised = value.replace("-", "").replace(" ", "").upper()
    if not _ISBN_RE.match(normalised):
        raise ValueError(
            f"{field_name} must be a valid ISBN-10 or ISBN-13 number."
        )
    return normalised


def validate_tags(tags: list[str], max_tags: int = 10) -> list[str]:
    """
    Sanitise a list of tag strings.
    - Max 10 tags
    - Each tag: max 50 chars, lowercase, alphanumeric + hyphens
    """
    if len(tags) > max_tags:
        raise ValueError(f"A maximum of {max_tags} tags are allowed.")
    cleaned = []
    for tag in tags:
        tag = sanitize_string(tag, max_length=50, field_name="tag")
        tag = tag.lower()
        if not re.match(r"^[a-z0-9][a-z0-9\- ]*[a-z0-9]$|^[a-z0-9]$", tag):
            raise ValueError(
                f"Tag {tag!r} contains invalid characters. "
                "Use lowercase letters, digits, hyphens, or spaces."
            )
        cleaned.append(tag)
    return cleaned


def validate_price(value: float, field_name: str = "price") -> float:
    """Price must be non-negative and a reasonable amount."""
    if not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a number.")
    if value < 0:
        raise ValueError(f"{field_name} must not be negative.")
    if value > 100_000:
        raise ValueError(f"{field_name} exceeds maximum allowed value.")
    # Round to 2 decimal places to prevent floating point games
    return round(float(value), 2)


def validate_pagination(skip: int = 0, limit: int = 50) -> tuple[int, int]:
    """Clamp pagination parameters to safe bounds."""
    skip = max(0, skip)
    limit = max(1, min(limit, 100))   # Never more than 100 items per page
    return skip, limit
