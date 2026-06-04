"""
Authentication service — production-grade implementation.

Security properties:
- Passwords hashed with bcrypt (12 rounds) via passlib.
- Dummy hash verify prevents timing-based user-enumeration on login.
- Account lockout after MAX_LOGIN_ATTEMPTS consecutive failures.
- Failed-attempt counter resets on successful login.
- Email verification tokens and password-reset tokens are single-use
  and stored as SHA-256 hashes in the DB (raw token only sent to user).
- Password-reset returns a generic message regardless of whether the
  email exists, preventing email enumeration.
- Refresh tokens use a separate JWT "type": "refresh" claim.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    dummy_verify,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    EmailVerificationRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.email_service import (
    send_password_reset_email,
    send_verification_email,
)

logger = logging.getLogger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_token_response(user: User) -> TokenResponse:
    access_token = create_access_token(
        subject=str(user.id),
        extra_claims={"role": user.role.value, "username": user.username},
    )
    refresh_token = create_refresh_token(subject=str(user.id))
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _check_account_lock(user: User) -> None:
    """Raise 429 if the account is currently locked."""
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = int(
            (user.locked_until - datetime.now(timezone.utc)).total_seconds() / 60
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Account is temporarily locked due to too many failed login attempts. "
                f"Try again in {remaining} minute(s)."
            ),
        )


# ── Public service functions ──────────────────────────────────────────────────

async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    """
    Register a new user.
    - Emails an email-verification link (or logs to console in dev mode).
    - The user is created with is_email_verified=False.
    """
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That email address is already registered.",
        )

    # Check username uniqueness
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That username is already taken.",
        )

    # Generate email verification token (single-use, time-limited)
    raw_token = generate_secure_token()
    token_hash = hash_token(raw_token)
    expires = datetime.now(timezone.utc) + timedelta(
        hours=settings.EMAIL_VERIFICATION_EXPIRE_HOURS
    )

    new_user = User(
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.USER,
        is_email_verified=False,
        email_verification_token=token_hash,
        email_verification_expires=expires,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Send verification email (non-blocking: log errors, never crash the request)
    try:
        await send_verification_email(new_user.email, new_user.full_name, raw_token)
    except Exception as exc:
        logger.error(
            "Failed to send verification email to %s: %s", new_user.email, exc
        )

    return new_user


async def login_user(db: AsyncSession, data: LoginRequest) -> TokenResponse:
    """
    Authenticate a user and return access + refresh tokens.

    Security:
    - Always performs a bcrypt operation (even when user not found) to
      prevent timing-based user-enumeration.
    - Locks the account after MAX_LOGIN_ATTEMPTS failures for
      LOCKOUT_DURATION_MINUTES minutes.
    - Failed-attempt counter and lockout are cleared on success.
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    # Constant-time path when user does not exist
    if user is None:
        dummy_verify()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Reject if account is currently locked
    _check_account_lock(user)

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.LOCKOUT_DURATION_MINUTES
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Too many failed attempts. Account locked for "
                    f"{settings.LOCKOUT_DURATION_MINUTES} minute(s)."
                ),
            )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Credentials valid — run remaining checks ──────────────────────────────
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact support.",
        )

    if settings.ENFORCE_EMAIL_VERIFICATION and not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified. Please check your inbox.",
        )

    # Reset brute-force counters on successful login
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    return _build_token_response(user)


async def refresh_tokens(db: AsyncSession, data: RefreshRequest) -> TokenResponse:
    """
    Issue a new access + refresh token pair using a valid refresh token.
    Validates the token type claim to prevent access tokens from being
    used as refresh tokens.
    """
    try:
        payload = decode_refresh_token(data.refresh_token)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise InvalidTokenError("Missing subject claim")
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account deactivated.",
        )

    return _build_token_response(user)


async def verify_email(db: AsyncSession, data: EmailVerificationRequest) -> dict:
    """
    Mark a user's email as verified using the single-use token from the
    verification email. The token is invalidated immediately after use.
    """
    token_hash = hash_token(data.token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(User).where(
            User.email_verification_token == token_hash,
            User.email_verification_expires > now,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired email verification token.",
        )

    user.is_email_verified = True
    user.email_verification_token = None   # Invalidate — single-use
    user.email_verification_expires = None
    await db.commit()

    return {"message": "Email verified successfully. You can now log in."}


async def resend_verification(db: AsyncSession, email: str) -> dict:
    """
    Re-generate and re-send an email verification link.
    Always returns a generic message to prevent email enumeration.
    """
    _GENERIC_MSG = (
        "If that email is registered and unverified, a new link has been sent."
    )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or user.is_email_verified:
        return {"message": _GENERIC_MSG}

    raw_token = generate_secure_token()
    token_hash = hash_token(raw_token)
    expires = datetime.now(timezone.utc) + timedelta(
        hours=settings.EMAIL_VERIFICATION_EXPIRE_HOURS
    )

    user.email_verification_token = token_hash
    user.email_verification_expires = expires
    await db.commit()

    try:
        await send_verification_email(user.email, user.full_name, raw_token)
    except Exception as exc:
        logger.error("Failed to resend verification email to %s: %s", user.email, exc)

    return {"message": _GENERIC_MSG}


async def request_password_reset(
    db: AsyncSession, data: PasswordResetRequest
) -> dict:
    """
    Generate a time-limited, single-use password-reset token and email it.
    Always returns a generic message to prevent email enumeration.
    """
    _GENERIC_MSG = (
        "If that email is registered, a password-reset link has been sent."
    )

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        return {"message": _GENERIC_MSG}

    raw_token = generate_secure_token()
    token_hash = hash_token(raw_token)
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES
    )

    user.password_reset_token = token_hash
    user.password_reset_expires = expires
    await db.commit()

    try:
        await send_password_reset_email(user.email, user.full_name, raw_token)
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", user.email, exc)

    return {"message": _GENERIC_MSG}


async def confirm_password_reset(
    db: AsyncSession, data: PasswordResetConfirm
) -> dict:
    """
    Verify the reset token and set the new password.
    - Token is invalidated immediately after successful use (single-use).
    - Clears any account lockout so the user can log in right away.
    """
    token_hash = hash_token(data.token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(User).where(
            User.password_reset_token == token_hash,
            User.password_reset_expires > now,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password-reset token.",
        )

    user.hashed_password = hash_password(data.new_password)
    user.password_reset_token = None   # Single-use — invalidate immediately
    user.password_reset_expires = None
    user.failed_login_attempts = 0    # Clear any lockout
    user.locked_until = None
    await db.commit()

    return {"message": "Password has been reset. You can now log in with your new password."}
