from __future__ import annotations

"""
Hierarchical summarization: chunks → sections → chapters → full book.

Why hierarchical?
A 600-page book has ~1,800 chunks. That's about 900,000 tokens total.
Gemini Pro's context is 2 million tokens, but:
1. It would cost ~$4.50 per summary at current pricing
2. Long contexts produce worse summaries — the model "loses focus"

Hierarchical approach:
- Summarise small groups of chunks (fits in one API call)
- Summarise groups of those summaries into chapters
- Summarise all chapters into the full book summary

Total tokens processed per book: ~50,000 instead of ~900,000. 18x cheaper, better quality.

IMPORTANT — why we use generate_content (sync) instead of generate_content_async:
google.generativeai uses grpc.aio channels that are bound to the first event loop
they are created on. In Celery workers, each asyncio.run() creates a NEW event loop.
On the second call (retry), the cached grpc.aio channels point to a CLOSED loop →
RuntimeError: Event loop is closed.
Using the synchronous generate_content() avoids grpc.aio entirely.
"""
import logging
import re
import time
from collections import defaultdict

import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import BookSummary
from app.generation.prompts import (
    SUMMARY_SECTION_PROMPT,
    SUMMARY_CHAPTER_PROMPT,
    SUMMARY_BOOK_PROMPT,
)
from app.generation.cache import set_summary_cache
from app.core.config import settings, configure_gemini

logger = logging.getLogger(__name__)


def _call_gemini_sync(prompt: str, model_name: str, max_tokens: int = 400) -> str:
    """
    Single synchronous Gemini call with automatic retry on 429 rate limits.

    Free tier limit: 15 generate_content requests/min for gemini-3.1-flash-lite.
    When a 429 is returned, the error message contains a retry_delay in seconds.
    We parse that and sleep before retrying (up to 3 attempts).

    Using sync here (not async) is intentional — see module docstring.
    """
    configure_gemini()
    model = genai.GenerativeModel(model_name)

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=max_tokens,
                    temperature=0.3,
                ),
            )
            return response.text.strip()
        except Exception as exc:
            err_str = str(exc)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                # Parse retry_delay from error message: "retry in X.XXs"
                match = re.search(r"retry in (\d+(?:\.\d+)?)s", err_str, re.IGNORECASE)
                wait = float(match.group(1)) if match else 30.0
                wait = min(wait + 5, 90)  # add 5s buffer, cap at 90s
                logger.warning(
                    f"Rate limit hit (attempt {attempt + 1}/3). "
                    f"Sleeping {wait:.0f}s before retry..."
                )
                time.sleep(wait)
                last_exc = exc
            else:
                raise  # non-rate-limit errors are not retried

    raise RuntimeError(f"Gemini call failed after 3 retries: {last_exc}")


async def generate_all_summaries(
    db: AsyncSession,
    book_id: str,
    book_title: str,
    chunks: list,  # list[ParentChildChunk]
) -> None:
    """
    Build the full summary hierarchy.
    Saves to book_summaries table and PostgreSQL cache.
    """
    logger.info(f"Starting summary generation for book_id={book_id} ({book_title})")

    # If there are no chunks (e.g. tiny test PDF), summarise the book title only
    if not chunks:
        logger.warning(f"  No chunks found for {book_id} — generating placeholder summary")
        full_summary = _call_gemini_sync(
            SUMMARY_BOOK_PROMPT.format(
                book_title=book_title,
                chapter_summaries="(No content was extracted from this document)",
            ),
            settings.summary_model,
            max_tokens=400,
        )
        db.add(BookSummary(
            book_id=book_id,
            level="full_book",
            summary_text=full_summary,
        ))
        await set_summary_cache(db, book_id, "full_book", full_summary)
        logger.info(f"Summary generation complete for {book_id} (placeholder)")
        return

    # Group chunks by chapter
    chapters: dict[str, list] = defaultdict(list)
    for chunk in chunks:
        key = chunk.chapter_title or "Main Content"
        chapters[key].append(chunk)

    chapter_summaries: list[str] = []

    # ── Level 1 + 2: section summaries → chapter summaries ────────────────
    for chapter_idx, (chapter_title, chapter_chunks) in enumerate(chapters.items()):
        logger.info(f"  Summarising chapter {chapter_idx + 1}: {chapter_title}")

        # Group chunks into batches of 5 for section summaries
        section_summaries = []
        batch_size = 5
        for i in range(0, len(chapter_chunks), batch_size):
            batch = chapter_chunks[i: i + batch_size]
            batch_text = "\n\n".join(c.child_text for c in batch)
            prompt = SUMMARY_SECTION_PROMPT.format(text=batch_text)
            summary = _call_gemini_sync(prompt, settings.qa_model)
            section_summaries.append(summary)

        # Combine into chapter summary
        chapter_prompt = SUMMARY_CHAPTER_PROMPT.format(
            chapter_title=chapter_title,
            section_summaries="\n\n".join(f"• {s}" for s in section_summaries),
        )
        chapter_summary = _call_gemini_sync(
            chapter_prompt, settings.qa_model, max_tokens=600
        )

        db.add(BookSummary(
            book_id=book_id,
            level="chapter",
            chapter_title=chapter_title,
            chapter_index=chapter_idx,
            summary_text=chapter_summary,
        ))
        chapter_summaries.append(f"**{chapter_title}**\n{chapter_summary}")

    await db.flush()

    # ── Level 3: full book summary ─────────────────────────────────────────
    logger.info("  Generating full book summary...")
    book_prompt = SUMMARY_BOOK_PROMPT.format(
        book_title=book_title,
        chapter_summaries="\n\n".join(chapter_summaries),
    )
    full_summary = _call_gemini_sync(
        book_prompt, settings.summary_model, max_tokens=800
    )

    db.add(BookSummary(
        book_id=book_id,
        level="full_book",
        summary_text=full_summary,
    ))

    await set_summary_cache(db, book_id, "full_book", full_summary)
    logger.info(f"Summary generation complete for {book_id}")
