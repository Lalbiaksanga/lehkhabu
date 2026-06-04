from __future__ import annotations

"""
Hybrid search: vector similarity + PostgreSQL full-text search + RRF fusion.

This is the core intelligence of the RAG system.
Understanding this file = understanding how the AI finds relevant text.
"""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text as sql_text

import google.generativeai as genai

from app.generation.query_expander import expand_query
from app.core.config import settings, configure_gemini


@dataclass
class RetrievedChunk:
    child_text: str        # what was matched (for display/citation)
    parent_text: str       # what goes into the Gemini prompt (richer context)
    page_number: Optional[int]
    chapter_title: Optional[str]
    section_title: Optional[str]
    chunk_index: int
    rrf_score: float       # combined relevance score (higher = more relevant)
    vector_rank: Optional[int]   # rank from vector search (None if not in top-20)
    fts_rank: Optional[int]      # rank from full-text search (None if not in top-20)


def _rrf_score(rank: Optional[int], k: int = 60) -> float:
    """
    Reciprocal Rank Fusion score.

    k=60 is the standard constant — it dampens the influence of very high ranks.
    A rank of 1 gives score = 1/61 ≈ 0.016
    A rank of 20 gives score = 1/80 = 0.0125

    When both searches agree on a chunk, scores add:
    rank 1 from vector + rank 1 from FTS = 0.016 + 0.016 = 0.032 — top score
    """
    if rank is None:
        return 0.0
    return 1.0 / (rank + k)


async def _embed_queries(questions: list[str]) -> list[float]:
    """
    Embed multiple query variants and return their average vector.
    Average = broader semantic coverage across all phrasings.
    """
    result = genai.embed_content(
        model=settings.embedding_model,
        content=questions,
        task_type="retrieval_query",
        output_dimensionality=settings.embedding_dimensions,
    )
    embeddings = result["embedding"]

    if len(embeddings) == 1:
        return embeddings[0]

    # Average the embeddings element-wise
    dim = len(embeddings[0])
    avg = [0.0] * dim
    for emb in embeddings:
        for i, val in enumerate(emb):
            avg[i] += val
    return [v / len(embeddings) for v in avg]


async def hybrid_search(
    db: AsyncSession,
    book_id: str,
    question: str,
    top_k: int = 8,
) -> list[RetrievedChunk]:
    """
    Full hybrid search pipeline.

    Steps:
    1. Expand query into 3 variants
    2. Embed all 3, take average vector
    3. Run vector search: top 20 by cosine similarity (halfvec HNSW index)
    4. Run full-text search: top 20 by PostgreSQL ts_rank
    5. Fuse both lists with RRF, return top_k

    Why top 20 from each, then pick top 8?
    We over-fetch to make sure both methods have room to contribute.
    A chunk might be rank 18 in vector search but rank 1 in FTS
    (e.g., contains an exact name). RRF will correctly boost it.
    """
    configure_gemini()
    vector_fetch = settings.vector_fetch_count
    fts_fetch = settings.fts_fetch_count

    # ── Step 1 + 2: Expand and embed ──────────────────────────────────────
    query_variants = await expand_query(question)
    query_vector = await _embed_queries(query_variants)
    vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

    # ── Step 3: Vector search ──────────────────────────────────────────────
    # At 768 dims (gemini-embedding-004), pgvector HNSW supports full-precision
    # vectors directly — no halfvec cast needed (limit is 2000 dims).
    vector_sql = sql_text("""
        SELECT
            id, child_text, parent_text, page_number,
            chapter_title, section_title, chunk_index,
            ROW_NUMBER() OVER (ORDER BY embedding <=> CAST(:vec AS vector)) AS rank
        FROM book_chunks
        WHERE book_id = :book_id
        ORDER BY embedding <=> CAST(:vec AS vector)
        LIMIT :n
    """)
    vector_result = await db.execute(vector_sql, {
        "vec": vector_str,
        "book_id": book_id,
        "n": vector_fetch,
    })
    vector_rows = {row.id: row for row in vector_result.fetchall()}

    # ── Step 4: Full-text search ───────────────────────────────────────────
    # websearch_to_tsquery handles natural language ("and", "or", quotes)
    # better than plainto_tsquery for user-supplied free-form questions.
    # ts_rank scores by how many query terms match, term frequency, etc.
    fts_sql = sql_text("""
        SELECT
            id, child_text, parent_text, page_number,
            chapter_title, section_title, chunk_index,
            ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, query) DESC) AS rank
        FROM book_chunks,
             websearch_to_tsquery('english', :query) query
        WHERE book_id = :book_id
          AND search_vector @@ query
        ORDER BY ts_rank(search_vector, query) DESC
        LIMIT :n
    """)
    fts_result = await db.execute(fts_sql, {
        "query": question,
        "book_id": book_id,
        "n": fts_fetch,
    })
    fts_rows = {row.id: row for row in fts_result.fetchall()}

    # ── Step 5: RRF fusion ─────────────────────────────────────────────────
    all_ids = set(vector_rows.keys()) | set(fts_rows.keys())

    scored = []
    for chunk_id in all_ids:
        vector_rank = int(vector_rows[chunk_id].rank) if chunk_id in vector_rows else None
        fts_rank = int(fts_rows[chunk_id].rank) if chunk_id in fts_rows else None

        rrf = _rrf_score(vector_rank) + _rrf_score(fts_rank)

        # Get the row data from whichever search found it
        row = vector_rows.get(chunk_id) or fts_rows[chunk_id]

        scored.append(RetrievedChunk(
            child_text=row.child_text,
            parent_text=row.parent_text,
            page_number=row.page_number,
            chapter_title=row.chapter_title,
            section_title=row.section_title,
            chunk_index=row.chunk_index,
            rrf_score=rrf,
            vector_rank=vector_rank,
            fts_rank=fts_rank,
        ))

    # Sort by RRF score descending, return top_k
    scored.sort(key=lambda x: x.rrf_score, reverse=True)
    return scored[:top_k]
