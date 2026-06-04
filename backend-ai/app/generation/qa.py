"""
Q&A pipeline with SSE streaming.

Flow:
1. Check PostgreSQL cache
2. Expand + embed query
3. Hybrid search (vector + FTS + RRF)
4. Build prompt with parent chunks
5. Stream from Gemini Flash
6. Save answer to PostgreSQL cache
"""
import json
import asyncio
from typing import AsyncGenerator

import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession

from app.retrieval.search import hybrid_search
from app.generation.prompts import SYSTEM_QA, format_qa_prompt
from app.generation.cache import get_cached_response, set_cached_response
from app.core.config import settings, configure_gemini
import logging

logger = logging.getLogger(__name__)


async def stream_qa_answer(
    db: AsyncSession,
    book_id: str,
    book_title: str,
    question: str,
) -> AsyncGenerator[str, None]:
    """
    Returns an async generator of SSE-formatted strings.
    
    Each yielded string is in the format:
        data: {"text": "...", "done": false}\n\n
    
    Final event:
        data: {"sources": [...], "done": true}\n\n
    
    Frontend reads these with EventSource or fetch + ReadableStream.
    """

    try:
        configure_gemini()
        # ── 1. Cache check ────────────────────────────────────────────────────
        cached = await get_cached_response(db, book_id, question, prefix="qa")
        if cached:
            yield f"data: {json.dumps({'text': cached, 'cached': True, 'done': False})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

        # ── 2. Retrieve relevant chunks ────────────────────────────────────────
        chunks = await hybrid_search(db, book_id, question)

        if not chunks:
            msg = "I couldn't find relevant content for that question in this book."
            yield f"data: {json.dumps({'text': msg, 'done': False})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

        # ── 3. Build prompt ────────────────────────────────────────────────────
        user_message = format_qa_prompt(question, chunks, book_title)

        # ── 4. Stream from Gemini Flash ────────────────────────────────────────
        model = genai.GenerativeModel(
            model_name=settings.qa_model,
            system_instruction=SYSTEM_QA,
        )

        full_answer = ""

        response = await model.generate_content_async(
            user_message,
            stream=True,
            generation_config=genai.GenerationConfig(
                max_output_tokens=1024,
                temperature=0.15,  # low = factual and grounded
            ),
        )

        async for piece in response:
            if piece.text:
                full_answer += piece.text
                yield f"data: {json.dumps({'text': piece.text, 'done': False})}\n\n"
            await asyncio.sleep(0)  # yield event loop so other requests aren't blocked

        # ── 5. Send source citations ───────────────────────────────────────────
        sources = []
        for chunk in chunks[:3]:  # top 3 sources
            source = {}
            if chunk.chapter_title:
                source["chapter"] = chunk.chapter_title
            if chunk.page_number:
                source["page"] = chunk.page_number
            source["relevance"] = round(chunk.rrf_score, 4)
            sources.append(source)

        yield f"data: {json.dumps({'sources': sources, 'done': True})}\n\n"

        # ── 6. Cache the answer ────────────────────────────────────────────────
        if len(full_answer) > 30:
            await set_cached_response(
                db, book_id, question, full_answer,
                ttl_hours=settings.qa_cache_ttl_hours, prefix="qa"
            )
    except Exception as exc:
        logger.error(f"stream_qa_answer error: {exc}", exc_info=True)
        yield f"data: {json.dumps({'error': 'An error occurred. Please try again.', 'done': True})}\n\n"
