from __future__ import annotations

"""
Parent-child chunker for books.

Every child chunk stores a pointer to its parent context.
Retrieval uses child chunks (precise).
Context sent to Gemini uses parent chunks (rich).
"""
import re
from dataclasses import dataclass
from typing import Optional

import tiktoken

from app.ingestion.parser import ParsedSection
from app.core.config import settings


@dataclass
class ParentChildChunk:
    child_text: str       # small, used for embedding + search
    parent_text: str      # large, used as context for Gemini
    chunk_index: int
    page_number: Optional[int]
    chapter_title: Optional[str]
    section_title: Optional[str]
    child_token_count: int


def _count_tokens(text: str) -> int:
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences on common punctuation."""
    sentences = re.split(r'(?<=[।.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def create_parent_child_chunks(sections: list[ParsedSection]) -> list[ParentChildChunk]:
    """
    Create parent-child chunks from parsed sections.
    
    Strategy:
    1. Build a flat list of all sentences from all sections
    2. Group sentences into child chunks (~256 tokens)
    3. For each child chunk, build a parent by including
       the previous child and the next child as context
    
    This way, each parent chunk contains 3x as much text
    as its child, centered on the most relevant part.
    """
    # First, flatten all sections into sentences with their metadata
    all_sentences = []
    for section in sections:
        if len(section.text.strip()) < 20:
            continue
        sentences = _split_into_sentences(section.text)
        for sentence in sentences:
            all_sentences.append({
                "text": sentence,
                "page": section.page_number,
                "chapter": section.chapter_title,
                "section": section.section_title,
            })

    # Build child chunks: accumulate sentences until we hit child_chunk_size
    child_chunk_size = settings.child_chunk_size   # 256 tokens
    child_texts = []
    buffer = []
    buffer_tokens = 0
    current_meta = {"page": None, "chapter": None, "section": None}

    for sent in all_sentences:
        sent_tokens = _count_tokens(sent["text"])

        if buffer_tokens + sent_tokens > child_chunk_size and buffer:
            child_texts.append({
                "text": " ".join(buffer),
                "tokens": buffer_tokens,
                **current_meta,
            })
            # 20% overlap: keep the last ~50 tokens as context
            overlap_words = buffer[-3:] if len(buffer) > 3 else buffer
            buffer = overlap_words
            buffer_tokens = sum(_count_tokens(w) for w in buffer)

        if not buffer:
            current_meta = {
                "page": sent["page"],
                "chapter": sent["chapter"],
                "section": sent["section"],
            }
        buffer.append(sent["text"])
        buffer_tokens += sent_tokens

    if buffer:
        child_texts.append({
            "text": " ".join(buffer),
            "tokens": buffer_tokens,
            **current_meta,
        })

    # Build parent chunks: each parent = previous child + this child + next child
    result = []
    for i, child in enumerate(child_texts):
        prev_text = child_texts[i - 1]["text"] if i > 0 else ""
        next_text = child_texts[i + 1]["text"] if i < len(child_texts) - 1 else ""

        parent_parts = [p for p in [prev_text, child["text"], next_text] if p]
        parent_text = "\n\n".join(parent_parts)

        result.append(ParentChildChunk(
            child_text=child["text"],
            parent_text=parent_text,
            chunk_index=i,
            page_number=child["page"],
            chapter_title=child["chapter"],
            section_title=child["section"],
            child_token_count=child["tokens"],
        ))

    return result
