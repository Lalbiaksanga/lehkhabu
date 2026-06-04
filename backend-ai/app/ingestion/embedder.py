from __future__ import annotations

"""
Batch embedding using Gemini (default: gemini-embedding-001 with 768-dim truncation).

Sends child_text chunks in batches to the Gemini API.
Returns 768-dimensional vectors via output_dimensionality truncation (Matryoshka).

IMPORTANT: Uses task_type="retrieval_document" for chunk embeddings.
Query embeddings (in search.py) use task_type="retrieval_query".
These two task types produce vectors optimized for asymmetric retrieval.
"""
import asyncio
import logging
from typing import List

import google.generativeai as genai
from app.core.config import settings, configure_gemini

logger = logging.getLogger(__name__)


async def embed_texts_batched(
    texts: List[str],
    batch_size: int | None = None,
    task_type: str = "retrieval_document",
) -> List[List[float]]:
    """
    Embed a list of texts in batches.
    
    Args:
        texts: List of text strings to embed
        batch_size: Number of texts per API call (default from settings)
        task_type: "retrieval_document" for chunks, "retrieval_query" for queries
    
    Returns:
        List of embedding vectors (768 dims, Matryoshka-truncated from native 3072)
    
    Rate limiting:
        Gemini free tier allows 100 embed_content requests per minute.
        We pace requests with a delay between batches and use exponential
        backoff with up to 3 retries when hitting 429 quota errors.
    """
    configure_gemini()
    if batch_size is None:
        batch_size = settings.embedding_batch_size

    all_embeddings: List[List[float]] = []
    max_retries = 3

    for i in range(0, len(texts), batch_size):
        batch = texts[i: i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(texts) + batch_size - 1) // batch_size
        logger.info(f"  Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)")

        # Retry loop with exponential backoff for rate limit errors
        for attempt in range(max_retries + 1):
            try:
                result = genai.embed_content(
                    model=settings.embedding_model,
                    content=batch,
                    task_type=task_type,
                    output_dimensionality=settings.embedding_dimensions,
                )

                # result["embedding"] is a list of vectors when content is a list
                embeddings = result["embedding"]
                all_embeddings.extend(embeddings)
                break  # success — exit retry loop

            except Exception as e:
                error_str = str(e)
                is_rate_limit = "429" in error_str or "quota" in error_str.lower()

                if attempt < max_retries:
                    if is_rate_limit:
                        # Rate limited — wait longer with exponential backoff
                        wait_time = 60 * (attempt + 1)  # 60s, 120s, 180s
                        logger.warning(
                            f"  Batch {batch_num} rate limited (attempt {attempt + 1}/{max_retries}). "
                            f"Waiting {wait_time}s before retry..."
                        )
                    else:
                        # Other error — shorter backoff
                        wait_time = 5 * (attempt + 1)  # 5s, 10s, 15s
                        logger.warning(
                            f"  Batch {batch_num} failed (attempt {attempt + 1}/{max_retries}): {e}. "
                            f"Retrying in {wait_time}s..."
                        )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        f"  Batch {batch_num} failed after {max_retries} retries: {e}"
                    )
                    raise

        # Rate limiting between batches — Gemini free tier: 100 req/min
        # Wait 1.5s between batches to stay well under the limit
        if i + batch_size < len(texts):
            await asyncio.sleep(1.5)

    return all_embeddings
