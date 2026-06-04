"""add vector index for 3072 dims using halfvec cast

Revision ID: 73af8b5007a4
Revises: 95fe228d1010
Create Date: 2026-04-11 05:38:00

pgvector 0.8.x limits HNSW and IVFFlat indexes to 2000 dimensions for
full-precision vector columns. gemini-embedding-2-preview outputs 3072 dims.

Solution: Use an expression index on embedding::halfvec(3072).
halfvec stores each float as 16-bit (half-precision) instead of 32-bit,
which halves memory usage AND raises the index dimension limit to 4000.

The search query must also cast to halfvec:
    ORDER BY embedding::halfvec(3072) <=> query::halfvec(3072)

Accuracy impact: negligible for retrieval. Half-precision is standard
practice for large-dim embedding indexes (used by Weaviate, Qdrant, etc).
"""
from typing import Sequence, Union
from alembic import op


revision: str = '73af8b5007a4'
down_revision: Union[str, Sequence[str], None] = '95fe228d1010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create HNSW index on embedding::halfvec(3072) for cosine similarity."""
    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")

    # Expression index: cast full-precision vector to halfvec on the fly.
    # This is the pgvector-recommended approach for dims > 2000.
    op.execute("""
        CREATE INDEX idx_book_chunks_embedding
        ON book_chunks
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_book_chunks_embedding")
