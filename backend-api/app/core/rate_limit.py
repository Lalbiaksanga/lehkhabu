"""
Rate-limiting configuration using slowapi (a FastAPI-compatible wrapper
around the `limits` library).

The limiter is created here as a module-level singleton so that route
decorators like @limiter.limit("5/minute") can import it without circular
dependencies.

Storage backend:
  - Redis (via REDIS_URL setting) is used in production for accurate
    cross-process counting.
  - Falls back to in-memory storage when REDIS_URL is unset or blank,
    which is suitable for development and single-process deployments.

Global cap: 200 requests/minute/IP (before per-route limits apply).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    # Use Redis in prod; fall back to in-memory for local dev (no Redis needed)
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
    default_limits=["200/minute"],  # Global safety cap per IP
)
