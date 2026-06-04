"""
Core security utilities for Lehkhabu API.

Design decisions:
- PyJWT replaces python-jose (better maintained, no known CVEs).
- Access tokens expire in 15 min; refresh tokens in 7 days.
- Password-reset and email-verification tokens are:
    1. Generated as cryptographically secure random bytes.
    2. Stored in the DB as SHA-256 hashes (the raw token is only sent to the user).
  This prevents database leaks from exposing usable tokens.
- bcrypt with 12 rounds is used for password hashing (OWASP recommendation).
- A pre-computed dummy hash is used to prevent user-enumeration via timing.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext

from app.core.config import settings

# ── Password hashing ──────────────────────────────────────────────────────────

# Explicit rounds (12) satisfies OWASP 2023 guidelines for bcrypt.
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

# Pre-computed bcrypt hash used when no user is found, so that invalid-user
# lookups take the same time as valid-user lookups (prevents timing attacks).
_DUMMY_HASH: str = pwd_context.hash("__lehkhabu_dummy_password__")


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the plaintext password."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext against a bcrypt hash (constant-time)."""
    return pwd_context.verify(plain, hashed)


def dummy_verify() -> None:
    """
    Perform a full bcrypt verification against a dummy hash.
    Call this when the user record is not found to prevent timing-based
    user-enumeration attacks.
    """
    pwd_context.verify("__not_a_real_password__", _DUMMY_HASH)


# ── Secure token helpers ──────────────────────────────────────────────────────

def generate_secure_token(nbytes: int = 32) -> str:
    """
    Generate a cryptographically secure URL-safe token.
    Used for email verification and password reset.
    The raw token is sent to the user; only its hash is stored in the DB.
    """
    return secrets.token_urlsafe(nbytes)


def hash_token(raw_token: str) -> str:
    """
    Return the SHA-256 hex-digest of a raw token for safe DB storage.
    This means a DB leak cannot be used to forge verification/reset links.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


def _decode(token: str) -> dict:
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.ALGORITHM],
        options={"require": ["sub", "exp", "iat", "type"]},
    )


def create_access_token(
    subject: str | Any,
    extra_claims: dict | None = None,
) -> str:
    """
    Create a short-lived access token (default: 15 min).
    Contains role and username for authorization without extra DB hits.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return _encode(payload)


def create_refresh_token(subject: str | Any) -> str:
    """
    Create a long-lived refresh token (default: 7 days).
    Only contains the user ID — no sensitive claims.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "refresh",
    }
    return _encode(payload)


def decode_access_token(token: str) -> dict:
    """
    Decode and validate an access token.
    Raises jwt.exceptions.InvalidTokenError on any failure.
    """
    payload = _decode(token)
    if payload.get("type") != "access":
        raise InvalidTokenError("Token is not an access token")
    return payload


def decode_refresh_token(token: str) -> dict:
    """
    Decode and validate a refresh token.
    Raises jwt.exceptions.InvalidTokenError on any failure.
    """
    payload = _decode(token)
    if payload.get("type") != "refresh":
        raise InvalidTokenError("Token is not a refresh token")
    return payload
