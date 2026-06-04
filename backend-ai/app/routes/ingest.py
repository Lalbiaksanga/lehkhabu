"""
Ingestion route — triggers book processing via Celery or direct file upload.

POST /ingest
  - Requires x-internal-key header (only backend-api can call this)
  - Dispatches a Celery task and returns the task ID immediately
  - The Celery worker handles: parse → chunk → embed → store → summarise

POST /ingest/upload
  - Requires x-internal-key header
  - Accepts a PDF/EPUB file upload via multipart form data
  - Runs ingestion directly (no Celery) and returns the result

GET /ingest/{task_id}/status
  - Returns the current status of an ingestion task
"""
import os
import uuid
import logging

from fastapi import APIRouter, HTTPException, Header, Depends, File, UploadFile, Form
from pydantic import BaseModel
from celery.result import AsyncResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.worker.celery_app import celery_app
from app.worker.book_tasks import ingest_book_task
from app.core.config import settings
from app.core.database import get_db
from app.ingestion.pipeline import ingest_book_from_file

logger = logging.getLogger(__name__)

# Directory to store uploaded files
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".epub"}

router = APIRouter(prefix="/ingest", tags=["ingestion"])


class IngestRequest(BaseModel):
    """Request body for triggering book ingestion."""
    book_id: str
    book_title: str
    file_url: str


class IngestResponse(BaseModel):
    """Response after dispatching an ingestion task."""
    task_id: str
    status: str
    message: str


def _verify_internal_key(x_internal_key: str = Header(...)):
    """Verify that the request comes from backend-api."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Invalid internal API key")
    return True


@router.post("", response_model=IngestResponse)
async def trigger_ingestion(
    request: IngestRequest,
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Trigger book ingestion as a background Celery task.
    
    The task will:
    1. Download the book file from file_url
    2. Parse it with Docling (structure-aware)
    3. Create parent-child chunks
    4. Generate embeddings with Gemini
    5. Store everything in PostgreSQL (chunks + vectors + tsvectors)
    6. Generate hierarchical summaries
    
    Returns immediately with a task_id for status polling.
    """
    task = ingest_book_task.delay(
        book_id=request.book_id,
        book_title=request.book_title,
        file_url=request.file_url,
    )

    return IngestResponse(
        task_id=task.id,
        status="queued",
        message=f"Ingestion started for '{request.book_title}'",
    )


@router.post("/upload")
async def upload_and_ingest(
    file: UploadFile = File(..., description="PDF or EPUB file to ingest"),
    book_id: str = Form(None, description="Unique book ID (auto-generated if not provided)"),
    book_title: str = Form(None, description="Book title (uses filename if not provided)"),
    db: AsyncSession = Depends(get_db),
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Upload a PDF or EPUB file and ingest it directly.

    This runs the full ingestion pipeline synchronously (no Celery needed):
    1. Save the uploaded file locally
    2. Parse it with Docling (structure-aware)
    3. Create parent-child chunks
    4. Generate embeddings with Gemini
    5. Store everything in PostgreSQL (chunks + vectors + tsvectors)
    6. Generate hierarchical summaries

    Returns the ingestion result when complete.
    ⚠️ This may take 1-10 minutes depending on book size.
    """
    # Validate file extension
    filename = file.filename or "unknown.pdf"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: '{ext}'. Only {', '.join(ALLOWED_EXTENSIONS)} are allowed.",
        )

    # Default book_id and book_title from filename
    if not book_id:
        book_id = str(uuid.uuid4())
    if not book_title:
        book_title = os.path.splitext(filename)[0]

    # Save uploaded file
    saved_path = os.path.join(UPLOAD_DIR, f"{book_id}{ext}")
    try:
        content = await file.read()
        with open(saved_path, "wb") as f:
            f.write(content)
        logger.info(f"Saved uploaded file to {saved_path} ({len(content)} bytes)")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    try:
        result = await ingest_book_from_file(db, book_id, book_title, saved_path)
        return {
            "status": "completed",
            "message": f"Ingestion complete for '{book_title}'",
            **result,
        }
    except Exception as exc:
        logger.error(f"Ingestion failed for uploaded file: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}")
    finally:
        if os.path.exists(saved_path):
            os.remove(saved_path)
            logger.info(f"Cleaned up uploaded file: {saved_path}")


@router.get("/{task_id}/status")
async def get_ingestion_status(
    task_id: str,
    _auth: bool = Depends(_verify_internal_key),
):
    """
    Check the status of an ingestion task.
    
    Possible states:
    - PENDING: task is queued, waiting for a worker
    - STARTED: worker picked up the task
    - SUCCESS: ingestion completed successfully
    - FAILURE: ingestion failed (check error field)
    - RETRY: task failed and is being retried
    """
    result = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "status": result.status,
    }

    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            response["error"] = str(result.result)

    return response

