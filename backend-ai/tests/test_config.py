"""Unit tests for settings helpers."""
from app.core.config import AISettings


def test_cors_wildcard():
    s = AISettings(
        database_url="postgresql+asyncpg://x",
        gemini_api_key="k",
        internal_api_key="k",
        cors_origins="*",
    )
    assert s.cors_origin_list() == ["*"]


def test_cors_comma_separated():
    s = AISettings(
        database_url="postgresql+asyncpg://x",
        gemini_api_key="k",
        internal_api_key="k",
        cors_origins="http://localhost:3000, http://localhost:8000",
    )
    assert s.cors_origin_list() == ["http://localhost:3000", "http://localhost:8000"]
