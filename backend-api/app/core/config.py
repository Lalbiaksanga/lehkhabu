from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────
    APP_NAME: str = "Lehkhabu API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://localhost/lehkhabu_dev"
    SYNC_DATABASE_URL_OVERRIDE: str = ""

    @property
    def SYNC_DATABASE_URL(self) -> str:
        if self.SYNC_DATABASE_URL_OVERRIDE:
            return self.SYNC_DATABASE_URL_OVERRIDE
        return self.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://"
        )

    # ── Redis ────────────────────────────────────────
    REDIS_URL: str = ""

    # ── JWT ──────────────────────────────────────────
    # SECURITY: This MUST be set to a strong random value in production.
    # Generate with: python -c "import secrets; print(secrets.token_hex(64))"
    JWT_SECRET: str = "CHANGE_ME"
    ALGORITHM: str = "HS256"

    # Access tokens are short-lived; refresh tokens are long-lived.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Email Verification ────────────────────────────
    EMAIL_VERIFICATION_EXPIRE_HOURS: int = 24
    # Set to True to require email verification before login is allowed.
    ENFORCE_EMAIL_VERIFICATION: bool = False

    # ── Password Reset ────────────────────────────────
    # Tokens are single-use and time-limited.
    PASSWORD_RESET_EXPIRE_MINUTES: int = 15

    # ── Brute-Force / Account Lockout ─────────────────
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    # ── Frontend ──────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    # ── SMTP (leave blank to use console logging in dev) ─
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_TLS: bool = True
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@lehkhabu.com"
    SMTP_FROM_NAME: str = "Lehkhabu"

    # ── Supabase (server-side only – never expose SERVICE_ROLE_KEY to frontend) ─
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""  # Server-side ONLY

    # ── Razorpay ─────────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    # ── Storage buckets ──────────────────────────────
    SUPABASE_BUCKET_COVERS: str = "book-covers"
    SUPABASE_BUCKET_FILES: str = "book-files"
    SUPABASE_BUCKET_AVATARS: str = "avatars"

    # ── CORS ─────────────────────────────────────────
    # Explicit list of allowed origins; never use "*" with credentials.
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    def validate_secrets(self) -> None:
        """Call at startup to catch insecure config early."""
        if self.JWT_SECRET in ("CHANGE_ME", "change_this_to_a_long_random_string", ""):
            raise RuntimeError(
                "JWT_SECRET is not set or is using the default placeholder. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(64))\""
            )
        if len(self.JWT_SECRET) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters long.")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
