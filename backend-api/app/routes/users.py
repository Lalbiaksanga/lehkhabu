"""
User routes — tightly scoped access control.

Access rules:
  GET  /users/             → Admin only (paginated; never exposes security fields)
  GET  /users/me           → Any authenticated user (own profile)
  PATCH /users/me          → Any authenticated user (own profile; restricted fields only)
  PUT  /users/me/password  → Any authenticated user (own password; requires current password)
  GET  /users/{user_id}    → Public profiles are visible to anyone authenticated;
                             private profiles (is_public_library=False) are visible
                             only to the owner and admins.
  GET  /users/{user_id}/author-profile → Same visibility rules as above.

IDOR mitigations:
  - /users/me always derives the user ID from the JWT — never accepts a user_id param.
  - Profile update only applies to the authenticated user's own row.
  - Password change verifies the current password before making changes.
  - List endpoint is Admin-only with pagination capped at 100.
"""

import json
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentAdmin, CurrentUser, get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import AuthorProfile, User
from app.schemas.user import (
    AuthorProfileOut,
    ChangePasswordRequest,
    UserOut,
    UserUpdateSelf,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Admin: list all users ─────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[UserOut],
    summary="[Admin] List all users",
)
async def list_users(
    current_admin: CurrentAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
):
    """
    Paginated list of all users — Admin access only.
    Pagination is capped server-side; clients cannot request more than 100 rows.
    """
    skip = max(0, skip)
    limit = max(1, min(limit, 100))   # Hard cap
    result = await db.execute(select(User).offset(skip).limit(limit))
    return result.scalars().all()


# ── Authenticated user: own profile ──────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserOut,
    summary="Get own profile",
)
async def get_my_profile(current_user: CurrentUser):
    """
    Returns the authenticated user's own profile.
    The user ID is derived entirely from the JWT — no path parameter.
    """
    return current_user


@router.patch(
    "/me",
    response_model=UserOut,
    summary="Update own profile",
)
async def update_my_profile(
    data: UserUpdateSelf,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update the authenticated user's own profile.
    Only fields in UserUpdateSelf are writable; role / is_active /
    security fields are never modifiable here.
    """
    update_data = data.model_dump(exclude_none=True)

    # social_links: serialise dict → JSON string for storage
    if "social_links" in update_data and isinstance(update_data["social_links"], dict):
        update_data["social_links"] = json.dumps(update_data["social_links"])

    for field, value in update_data.items():
        setattr(current_user, field, value)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put(
    "/me/password",
    response_model=dict,
    summary="Change own password",
)
async def change_my_password(
    data: ChangePasswordRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Change the authenticated user's own password.
    Requires the current password to be correct (prevents session-hijack escalation).
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current password.",
        )

    current_user.hashed_password = hash_password(data.new_password)
    # Clear any lockout state — user has just proven ownership
    current_user.failed_login_attempts = 0
    current_user.locked_until = None
    db.add(current_user)
    await db.commit()

    return {"message": "Password changed successfully."}


# ── Public: view another user's profile ──────────────────────────────────────

@router.get(
    "/{user_id}",
    response_model=UserOut,
    summary="Get a user's public profile",
)
async def get_user(
    user_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Fetch another user's profile.
    - If the profile is private (is_public_library=False), only the owner
      or an Admin may view it.
    - Authentication is always required (no anonymous profile browsing).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Ownership or admin check for private profiles
    is_owner = str(current_user.id) == str(user_id)
    is_admin = current_user.role.value == "admin"

    if not user.is_public_library and not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user's profile is private.",
        )

    return user


@router.get(
    "/{user_id}/author-profile",
    response_model=AuthorProfileOut,
    summary="Get a user's author profile",
)
async def get_user_author_profile(
    user_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Fetch the public author profile for a given user.
    Requires authentication. Private user profiles block author profile access too.
    """
    # First verify the parent user exists and is accessible
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    is_owner = str(current_user.id) == str(user_id)
    is_admin = current_user.role.value == "admin"

    if not user.is_public_library and not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user's profile is private.",
        )

    result = await db.execute(
        select(AuthorProfile).where(AuthorProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Author profile not found for this user.",
        )
    return profile
