"""
Q&A route with SSE (Server-Sent Events) streaming.

GET /qa?book_id=...&question=...&book_title=...
  - Returns a streaming response with content-type: text/event-stream
  - Each event: data: {"text": "...", "done": false}
  - Final event: data: {"sources": [...], "done": true}

Frontend consumes this with EventSource or fetch() + ReadableStream.
"""
from fastapi import APIRouter, Query, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.generation.qa import stream_qa_answer

router = APIRouter(prefix="/qa", tags=["question-answering"])


def _verify_internal_key(x_internal_key: str = Header(...)):
    """Verify that the request comes from backend-api."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Invalid internal API key")
    return True


@router.get("")
async def question_answer(
    book_id: str = Query(..., description="UUID of the book to query"),
    question: str = Query(..., min_length=3, description="The user's question"),
    book_title: str = Query("Unknown Book", description="Title of the book (for prompt context)"),
    db: AsyncSession = Depends(get_db),
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Stream a Q&A answer using SSE.
    
    The full pipeline:
    1. Check PostgreSQL cache for this exact question
    2. If not cached: expand query (3 variants) → embed → hybrid search → RRF fusion
    3. Build prompt with top 8 parent chunks
    4. Stream response from Gemini Flash word by word
    5. Cache the complete answer for 24 hours
    
    Returns a text/event-stream response for real-time word-by-word display.
    """
    return StreamingResponse(
        stream_qa_answer(db, book_id, book_title, question),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering if proxied
        },
    )
