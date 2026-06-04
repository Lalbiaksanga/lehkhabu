"""
FastAPI application entry point for Lehkhabu API.

Security hardening applied here:
- CORS: explicit origin allowlist, never "*" with credentials.
- Slowapi: IP-based rate limiting, backed by Redis.
- Security headers middleware: HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- JWT_SECRET validated at startup — app refuses to start with the default placeholder.
"""

import logging

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.rate_limit import limiter
from app.routes import admin, auth, books, purchases, users

logger = logging.getLogger(__name__)

# ── Validate secrets at process start ─────────────────────────────────────────
settings.validate_secrets()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    # Hide /docs and /redoc in production
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
# SECURITY: Never use allow_origins=["*"] with allow_credentials=True.
# Use the explicit allowlist from settings.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


# ── Security response headers ─────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Disallow embedding in iframes (clickjacking protection)
    response.headers["X-Frame-Options"] = "DENY"
    # Enable browser XSS filter (legacy browsers)
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Force HTTPS for 1 year, including subdomains
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    # Restrict referrer info
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Minimal permissions policy
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # Remove server fingerprint header
    response.headers.pop("Server", None)
    return response


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(books.router,     prefix="/books",     tags=["books"])
app.include_router(users.router,     prefix="/users",     tags=["users"])
app.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
app.include_router(admin.router,     prefix="/admin",     tags=["admin"])


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Lehkhabu API is running."}


@app.get("/health", tags=["infra"])
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        # In production, run behind a reverse proxy (nginx/caddy) that
        # handles TLS — do NOT enable SSL directly in uvicorn in prod.
    )
