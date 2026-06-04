"""Unit tests for parent-child chunking."""
from app.ingestion.chunker import create_parent_child_chunks, _count_tokens
from app.ingestion.parser import ParsedSection


def test_count_tokens_positive():
    assert _count_tokens("Hello world") > 0


def test_parent_includes_neighbor_context():
    sections = [
        ParsedSection(
            text="First sentence here. Second sentence here. Third sentence here.",
            page_number=1,
            chapter_title="Ch1",
            section_title="Sec1",
        ),
    ]
    chunks = create_parent_child_chunks(sections)
    assert len(chunks) >= 1
    child = chunks[0]
    assert child.child_text
    assert child.parent_text
    # Parent should be at least as long as child (prev + child + next)
    assert len(child.parent_text) >= len(child.child_text)


def test_empty_sections_returns_empty():
    assert create_parent_child_chunks([]) == []
