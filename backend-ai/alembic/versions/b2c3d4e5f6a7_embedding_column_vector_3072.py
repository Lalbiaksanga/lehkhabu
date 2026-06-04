"""upgrade embedding column to vector(3072)

Revision ID: b2c3d4e5f6a7
Revises: 73af8b5007a4
Create Date: 2026-05-22

The initial migration created vector(768) for text-embedding-004.
The app now uses gemini-embedding-2-preview (3072 dimensions).

768-dim rows cannot be cast to 3072 — existing chunks are truncated.
Re-run book ingestion after applying this migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "73af8b5007a4"
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
    bind = op.get_bind()
    coltype = _current_embedding_type(bind)

    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")

    if "3072" not in coltype:
        # Incompatible dimensions — must re-ingest all books
        op.execute("TRUNCATE TABLE book_chunks")
        op.execute(
            "ALTER TABLE book_chunks "
            "ALTER COLUMN embedding TYPE vector(3072)"
        )

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_book_chunks_embedding
        ON book_chunks
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    bind = op.get_bind()
    coltype = _current_embedding_type(bind)

    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")

    if "768" not in coltype:
        op.execute("TRUNCATE TABLE book_chunks")
        op.execute(
            "ALTER TABLE book_chunks "
            "ALTER COLUMN embedding TYPE vector(768)"
        )

    op.execute("""
        CREATE INDEX idx_book_chunks_embedding
        ON book_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
