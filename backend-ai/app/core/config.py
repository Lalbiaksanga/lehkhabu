from pydantic_settings import BaseSettings
from functools import lru_cache


class AISettings(BaseSettings):
    # Shared PostgreSQL database — same as backend-api
    database_url: str

    # Gemini
    gemini_api_key: str
    embedding_model: str = "models/gemini-embedding-001"
    qa_model: str = "models/gemini-3.1-flash-lite-preview"
    summary_model: str = "models/gemini-3.1-flash-lite-preview"

    # Truncated output size — must match the Vector(N) in book_chunks.embedding.
    # gemini-embedding-001 natively produces 3072 dims but supports
    # output_dimensionality to Matryoshka-truncate to any smaller size.
    embedding_dimensions: int = 768

    # Parent-child chunking sizes
    child_chunk_size: int = 256    # tokens for child (retrieval)
    # parent is built from prev + child + next child (~768 tokens total)

    embedding_batch_size: int = 100  # chunks per Gemini API call

    # Hybrid search
    top_k_chunks: int = 8          # final chunks returned after RRF
    vector_fetch_count: int = 20   # over-fetch before fusion
    fts_fetch_count: int = 20      # over-fetch before fusion

    # Cache TTL
    qa_cache_ttl_hours: int = 24
    summary_cache_ttl_hours: int = 168  # 7 days

    # Internal auth
    internal_api_key: str

    # Celery broker + result backend (PostgreSQL — zero Redis)
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    # Comma-separated origins allowed to call this API (use * only in local dev)
    cors_origins: str = "*"

    class Config:
        env_file = ".env"

    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache()
def get_settings() -> AISettings:
    return AISettings()


settings = get_settings()

@lru_cache()
def configure_gemini() -> None:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
