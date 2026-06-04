"""
Authentication routes with rate limiting.

Rate limits (per IP):
  POST /auth/register          → 10 requests / hour
  POST /auth/login             → 10 requests / minute
  POST /auth/refresh           → 30 requests / minute
  POST /auth/verify-email      → 10 requests / hour
  POST /auth/resend-verification → 5 requests / hour
  POST /auth/request-password-reset → 5 requests / hour
  POST /auth/reset-password    → 10 requests / hour
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.auth import (
    EmailVerificationRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    TokenResponse,
    MessageResponse,
)
from app.schemas.user import UserOut
from app.services.auth_service import (
    confirm_password_reset,
    login_user,
    refresh_tokens,
    register_user,
    request_password_reset,
    resend_verification,
    verify_email,
)

router = APIRouter()


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
@limiter.limit("10/hour")
async def register(
    request: Request,
    data: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new user account. Sends an email-verification link to the
    provided address. The account is usable immediately but email verification
    may be required depending on server configuration.
    """
    return await register_user(db, data)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive access + refresh tokens",
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Authenticate with email + password. Returns a short-lived access token
    (15 min) and a long-lived refresh token (7 days).

    Accounts are locked for 15 minutes after 5 consecutive failures.
    """
    return await login_user(db, data)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh expired access token",
)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    data: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    The client should store the new refresh token and discard the old one.
    """
    return await refresh_tokens(db, data)


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current authenticated user",
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Return the profile of the currently authenticated user."""
    return current_user


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify email address",
)
@limiter.limit("10/hour")
async def verify_email_route(
    request: Request,
    data: EmailVerificationRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Verify a user's email address using the token from the verification email.
    Tokens are single-use and expire after 24 hours.
    """
    return await verify_email(db, data)


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    summary="Resend email verification link",
)
@limiter.limit("5/hour")
async def resend_verification_route(
    request: Request,
    data: ResendVerificationRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Re-send the email-verification link to the given address.
    Always returns a generic response to prevent email enumeration.
    """
    return await resend_verification(db, data.email)


@router.post(
    "/request-password-reset",
    response_model=MessageResponse,
    summary="Request a password-reset email",
)
@limiter.limit("5/hour")
async def request_reset(
    request: Request,
    data: PasswordResetRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Send a time-limited, single-use password-reset link to the given email.
    Always returns a generic response to prevent email enumeration.
    """
    return await request_password_reset(db, data)


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Set a new password using a reset token",
)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    data: PasswordResetConfirm,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Set a new password. Requires the single-use token from the password-reset
    email. The token is invalidated immediately after use.
    """
    return await confirm_password_reset(db, data)
