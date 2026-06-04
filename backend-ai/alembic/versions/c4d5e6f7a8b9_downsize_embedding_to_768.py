"""downgrade embedding from vector(3072) to vector(768)

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-06-03

Switch from gemini-embedding-2-preview (3072 dims) to gemini-embedding-004 (768 dims).

At 768 dims, pgvector HNSW works with full-precision vectors directly
(the 2000-dim limit only applies to full-precision HNSW/IVFFlat indexes).
No halfvec workaround needed.

Existing 3072-dim embeddings are incompatible with 768-dim — all chunks
are truncated. Re-run book ingestion after applying this migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _current_embedding_type(bind) -> str:
    row = bind.execute(
        sa.text("""
            SELECT format_type(a.atttypid, a.atttypmod) AS coltype
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            WHERE c.relname = 'book_chunks'
              AND a.attname = 'embedding'
              AND NOT a.attisdropped
            LIMIT 1
        """)
    ).fetchone()
    return (row.coltype if row else "") or ""


def upgrade() -> None:
    """Downsize embedding column from vector(3072) to vector(768)."""
    bind = op.get_bind()
    coltype = _current_embedding_type(bind)

    # Drop the old halfvec HNSW index
    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")

    if "768" not in coltype:
        # Incompatible dimensions — must re-ingest all books
        op.execute("TRUNCATE TABLE book_chunks")
        op.execute(
            "ALTER TABLE book_chunks "
            "ALTER COLUMN embedding TYPE vector(768)"
        )

    # Create standard HNSW index — 768 dims is under the 2000-dim limit
    # so we use full-precision vector, no halfvec cast needed
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_book_chunks_embedding
        ON book_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    """Restore embedding column to vector(3072) with halfvec HNSW index."""
    bind = op.get_bind()
    coltype = _current_embedding_type(bind)

    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")

    if "3072" not in coltype:
        op.execute("TRUNCATE TABLE book_chunks")
        op.execute(
            "ALTER TABLE book_chunks "
            "ALTER COLUMN embedding TYPE vector(3072)"
        )

    # Recreate halfvec HNSW index for 3072 dims
    op.execute("""
        CREATE INDEX idx_book_chunks_embedding
        ON book_chunks
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
