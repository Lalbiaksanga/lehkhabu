"""
Structure-aware PDF/EPUB parser using Docling (IBM).

Docling understands document structure: headings, tables, footnotes, pages.
This is critical for a book platform — we preserve chapter/section metadata
so the AI can cite "Chapter 3, page 47" rather than "chunk #142".

Fallback: If Docling is not available, we use a simpler PyMuPDF/text approach.
"""
import logging
import tempfile
import os
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ParsedSection:
    """One section of parsed content with its metadata."""
    text: str
    page_number: Optional[int] = None
    chapter_title: Optional[str] = None
    section_title: Optional[str] = None


@dataclass
class ParsedDocument:
    """Complete parsed document with all sections and metadata."""
    sections: list[ParsedSection] = field(default_factory=list)
    total_pages: int = 0
    title: Optional[str] = None


async def _download_file(url: str, dest_path: str) -> None:
    """Download a file from URL to a local path."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(response.content)


def _extract_sections_from_doc(doc) -> list[ParsedSection]:
    """
    Extract structured sections from a Docling document object.

    Uses iterate_items() for structure-aware extraction (chapters, sections, pages).
    Falls back to markdown export if structured parsing yields nothing.
    """
    sections: list[ParsedSection] = []
    current_chapter: Optional[str] = None
    current_section: Optional[str] = None

    for item, _level in doc.iterate_items():
        # ── Get text content (Docling 2.x uses item.text directly) ──────────
        text = ""
        if hasattr(item, "text") and item.text:
            text = item.text

        if not text or len(text.strip()) < 10:
            continue

        # ── Get page number from provenance ──────────────────────────────────
        page_num: Optional[int] = None
        if hasattr(item, "prov") and item.prov:
            prov = item.prov[0] if isinstance(item.prov, list) else item.prov
            if hasattr(prov, "page_no"):
                page_num = prov.page_no

        # ── Detect headings to track chapter/section metadata ────────────────
        label = ""
        if hasattr(item, "label"):
            label = str(item.label).lower()

        if "heading" in label or "section_header" in label:
            heading_level_1 = (
                _level <= 1
                or label in ("heading_1", "section_header_1", "title")
                or label.endswith("_1")
            )
            if heading_level_1:
                current_chapter = text.strip()
            else:
                current_section = text.strip()
            continue  # headings themselves become metadata, not content chunks

        sections.append(ParsedSection(
            text=text.strip(),
            page_number=page_num,
            chapter_title=current_chapter,
            section_title=current_section,
        ))

    # If structured item parsing yielded nothing, fall back to full markdown
    # split by page. This handles edge cases where Docling returns no items.
    if not sections:
        logger.info("Structured parse yielded 0 items — falling back to markdown export")
        markdown = doc.export_to_markdown()
        paragraphs = [p.strip() for p in markdown.split("\n\n") if len(p.strip()) >= 20]
        sections = [
            ParsedSection(text=p, page_number=i + 1)
            for i, p in enumerate(paragraphs)
        ]

    return sections


def _build_parsed_document(sections: list[ParsedSection]) -> ParsedDocument:
    """Build a ParsedDocument from a list of sections."""
    page_numbers = [s.page_number for s in sections if s.page_number is not None]
    total_pages = max(page_numbers) if page_numbers else len(sections) // 3 or 1
    return ParsedDocument(sections=sections, total_pages=total_pages, title=None)


def _try_docling_parse(file_path: str, do_ocr: bool) -> list[ParsedSection]:
    """
    Attempt to parse a PDF with Docling, with OCR enabled or disabled.

    When do_ocr=False:
      Uses PyPdfiumDocumentBackend to extract text directly from the PDF's
      embedded text layer. Fast and perfect for digital/selectable-text PDFs.

    When do_ocr=True:
      Uses the default Docling pipeline which includes EasyOCR.
      Handles scanned PDFs and image-based pages.

    Returns extracted sections, or empty list on failure.
    """
    try:
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
    except ImportError:
        return []

    try:
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = do_ocr

        format_kwargs = {"pipeline_options": pipeline_options}

        if not do_ocr:
            # Use PyPdfium backend — reads the embedded text layer directly,
            # strictly respects do_ocr=False, and avoids unnecessary OCR models
            try:
                from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
                format_kwargs["backend"] = PyPdfiumDocumentBackend
            except ImportError:
                logger.info("PyPdfiumDocumentBackend not available, using default backend")

        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(**format_kwargs)
            }
        )

        result = converter.convert(file_path)
        return _extract_sections_from_doc(result.document)
    except Exception as e:
        logger.warning(f"Docling parse failed (do_ocr={do_ocr}): {e}")
        return []


def _parse_with_docling(file_path: str) -> ParsedDocument:
    """
    Parse a document using Docling 2.x with smart OCR handling.

    Strategy for PDFs (handles digital, scanned, AND mixed PDFs):
      1. Try WITHOUT OCR first — uses PyPdfiumDocumentBackend to read the
         embedded text layer directly. This is fast and perfect for digital
         PDFs with selectable text.
      2. If insufficient text was extracted (< 500 chars), the PDF likely
         contains scanned/image pages. Retry WITH OCR using EasyOCR.
      3. Return whichever pass extracted more content.
      4. Fall back to PyMuPDF simple parser if both Docling passes fail.

    For non-PDF files (EPUB, etc.), uses default Docling settings.
    """
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        logger.warning("Docling not installed, falling back to simple parser")
        return _parse_simple(file_path)

    ext = os.path.splitext(file_path)[1].lower()

    # ── Non-PDF files: use default Docling (no OCR concern) ──────────────
    if ext != ".pdf":
        try:
            converter = DocumentConverter()
            result = converter.convert(file_path)
            sections = _extract_sections_from_doc(result.document)
            if sections:
                return _build_parsed_document(sections)
        except Exception as e:
            logger.warning(f"Docling failed for {ext} file: {e}")
        return _parse_simple(file_path)

    # ── PDF: Two-pass strategy ───────────────────────────────────────────

    # Pass 1: WITHOUT OCR (embedded text extraction — fast)
    logger.info("Pass 1: Extracting embedded text without OCR...")
    sections_no_ocr = _try_docling_parse(file_path, do_ocr=False)
    total_chars_no_ocr = sum(len(s.text) for s in sections_no_ocr)
    logger.info(
        f"Pass 1 result: {len(sections_no_ocr)} sections, {total_chars_no_ocr} chars"
    )

    # If we got substantial embedded text, the PDF is digital — use it
    if total_chars_no_ocr >= 500:
        logger.info("Sufficient embedded text found — skipping OCR pass")
        return _build_parsed_document(sections_no_ocr)

    # Pass 2: WITH OCR (for scanned or mixed PDFs)
    logger.info(
        f"Pass 1 yielded only {total_chars_no_ocr} chars. "
        f"Pass 2: Retrying with OCR for scanned pages..."
    )
    sections_ocr = _try_docling_parse(file_path, do_ocr=True)
    total_chars_ocr = sum(len(s.text) for s in sections_ocr)
    logger.info(
        f"Pass 2 result: {len(sections_ocr)} sections, {total_chars_ocr} chars"
    )

    # Return whichever pass extracted more content
    if sections_ocr and total_chars_ocr > total_chars_no_ocr:
        logger.info("Using OCR results (more content extracted)")
        return _build_parsed_document(sections_ocr)

    if sections_no_ocr:
        logger.info("Using non-OCR results")
        return _build_parsed_document(sections_no_ocr)

    if sections_ocr:
        logger.info("Using OCR results (only available)")
        return _build_parsed_document(sections_ocr)

    # Both Docling passes failed — fall back to simple parser
    logger.warning("Both Docling passes yielded no content, falling back to simple parser")
    return _parse_simple(file_path)



def _parse_simple(file_path: str) -> ParsedDocument:
    """
    Simple fallback parser using basic text extraction.
    Used when Docling is not available.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return _parse_pdf_simple(file_path)
    elif ext in (".epub", ".txt"):
        return _parse_text_simple(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


def _parse_pdf_simple(file_path: str) -> ParsedDocument:
    """Extract text from PDF page by page."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("Neither Docling nor PyMuPDF is installed. Cannot parse PDF.")

    doc = fitz.open(file_path)
    sections = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text")

        if text and len(text.strip()) > 20:
            sections.append(ParsedSection(
                text=text.strip(),
                page_number=page_num + 1,
                chapter_title=None,
                section_title=None,
            ))

    return ParsedDocument(
        sections=sections,
        total_pages=len(doc),
    )


def _parse_text_simple(file_path: str) -> ParsedDocument:
    """
    Extract text from plain text or EPUB files.
    TODO: EPUB fallback via _parse_text_simple reads raw bytes, not EPUB structure.
          If Docling is unavailable, EPUBs will produce garbage text.
          Need to add ebooklib as a proper fallback dependency.
    """
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Split into paragraph-sized sections
    paragraphs = [p.strip() for p in content.split("\n\n") if len(p.strip()) > 20]
    sections = [
        ParsedSection(text=p, page_number=i + 1)
        for i, p in enumerate(paragraphs)
    ]

    return ParsedDocument(
        sections=sections,
        total_pages=len(sections),
    )


async def parse_from_url(file_url: str) -> ParsedDocument:
    """
    Download a book file and parse it.
    
    This is the main entry point for the ingestion pipeline.
    Downloads the file to a temp directory, then parses it.
    """
    # Determine file extension from URL
    url_path = file_url.split("?")[0]  # strip query params
    ext = os.path.splitext(url_path)[1].lower() or ".pdf"

    with tempfile.TemporaryDirectory() as tmp_dir:
        file_path = os.path.join(tmp_dir, f"book{ext}")
        logger.info(f"Downloading book from {file_url[:80]}...")
        await _download_file(file_url, file_path)
        logger.info(f"Downloaded to {file_path}, parsing...")

        # Docling parsing is synchronous — fine for Celery worker
        return _parse_with_docling(file_path)


def parse_from_file(file_path: str) -> ParsedDocument:
    """
    Parse a book from a local file path (no download needed).

    Used by the /ingest/upload route for direct file uploads.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    logger.info(f"Parsing local file: {file_path}")
    return _parse_with_docling(file_path)
