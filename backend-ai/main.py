"""
Lehkhabu Backend-AI — FastAPI Entry Point

The AI intelligence layer for the Lehkhabu book platform.
Runs on port 8001, called only by backend-api (never exposed to the internet).

Provides:
  POST /ingest     — Trigger book ingestion (parse → chunk → embed → summarize)
  GET  /qa         — SSE streaming Q&A with hybrid search
  GET  /summarize  — Pre-computed book and chapter summaries
  GET  /health     — Health check
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.routes import ingest, qa, summarize

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("🚀 Lehkhabu Backend-AI starting up...")
    logger.info("📦 PostgreSQL as broker, vector store, cache, and FTS — zero Redis")
    yield
    logger.info("👋 Lehkhabu Backend-AI shutting down...")


app = FastAPI(
    title="Lehkhabu Backend-AI",
    description="AI intelligence layer for the Lehkhabu book platform. "
                "Handles book ingestion, Q&A with hybrid search, and summarization.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — set CORS_ORIGINS in .env (comma-separated); default * is dev-only
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler ──────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


# ── Health check ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint. Returns service status."""
    database = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        database = f"error: {type(exc).__name__}"

    status = "healthy" if database == "ok" else "degraded"
    return {
        "status": status,
        "service": "lehkhabu-backend-ai",
        "version": "1.0.0",
        "database": database,
        "features": {
            "hybrid_search": "pgvector + tsvector + RRF",
            "chunking": "parent-child (256/768 tokens)",
            "embeddings": f"{settings.embedding_model} ({settings.embedding_dimensions} dims)",
            "streaming": f"SSE via {settings.qa_model}",
            "cache": "PostgreSQL ai_cache (no Redis)",
            "broker": "Celery + SQLAlchemy transport (no Redis)",
        },
    }


# ── Register routers ──────────────────────────────────────────────────────
app.include_router(ingest.router)
app.include_router(qa.router)
app.include_router(summarize.router)
