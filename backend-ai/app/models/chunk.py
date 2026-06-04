import uuid
from typing import Optional, List
# Note: ForeignKey to books.id is intentionally omitted.
# The 'books' table is owned by the Supabase schema (schema.sql).
# book_id is validated at the application layer, not DB level.

from sqlalchemy import (
    String, Integer, Text, DateTime, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class BookChunk(Base):
    """
    Stores every text chunk from every book.
    
    IMPORTANT: We use a parent-child chunking strategy.
    - child_text: small chunk (256 tokens) — used for RETRIEVAL (more precise)
    - parent_text: ~768 tokens (prev + child + next child) — used for CONTEXT
    
    We find relevant chunks using child_text similarity,
    then send parent_text to Gemini for the answer.
    This gives precise retrieval AND rich context.
    """
    __tablename__ = "book_chunks"

    # UUID columns use as_uuid=False so SQLAlchemy sends them as strings,
    # which asyncpg accepts and PostgreSQL casts correctly to the UUID column type.
    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    # References books.id from schema.sql (UUID column) — enforced at application layer
    book_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    chapter_title: Mapped[Optional[str]] = mapped_column(String(500))
    section_title: Mapped[Optional[str]] = mapped_column(String(500))

    # Parent-child chunking
    child_text: Mapped[str] = mapped_column(Text, nullable=False)    # small, for retrieval
    parent_text: Mapped[str] = mapped_column(Text, nullable=False)   # large, for context

    child_token_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # The embedding of child_text — 768 dims (gemini-embedding-001 truncated via output_dimensionality)
    embedding: Mapped[List[float]] = mapped_column(Vector(768), nullable=False)

    # search_vector (tsvector) is NOT declared here.
    # It is a GENERATED ALWAYS AS (to_tsvector('english', child_text)) STORED
    # column in PostgreSQL — the DB computes it automatically on INSERT.
    # search.py queries it via raw sql_text(), so the ORM never needs to reference it.
    # Declaring it here causes SQLAlchemy/asyncpg to try to INSERT it, which PostgreSQL rejects.

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # NOTE: The GIN index on search_vector and HNSW index on embedding
    # were created by Alembic migrations and exist in the DB.
    # They are not declared here to avoid SQLAlchemy trying to resolve
    # column references that are not in this ORM model.


class BookSummary(Base):
    """Pre-computed summaries at chapter and book level."""
    __tablename__ = "book_summaries"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    # References books.id from schema.sql (UUID column) — enforced at application layer
    book_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    chapter_title: Mapped[Optional[str]] = mapped_column(String(500))
    chapter_index: Mapped[Optional[int]] = mapped_column(Integer)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AICache(Base):
    """
    PostgreSQL-backed cache for AI responses.
    Replaces Redis entirely.
    
    TTL is implemented by checking expires_at > NOW() on reads.
    Stale rows are cleaned up by a Celery periodic task.
    """
    __tablename__ = "ai_cache"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    cache_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    last_hit: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True))
