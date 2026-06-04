"""
All prompts in one file. Change a prompt here = change all answers.
These are carefully designed for a book Q&A system.
"""

# ── Q&A prompt ──────────────────────────────────────────────────────────────
SYSTEM_QA = """You are a knowledgeable reading assistant for Lehkhabu, a book platform.
You help readers understand, explore, and learn from books they have purchased.

Your rules:
1. Answer based ONLY on the book excerpts provided. Do not use outside knowledge.
2. If the answer is not in the excerpts, say clearly: "This topic doesn't appear in the sections I found."
3. When possible, cite the chapter or page: "According to Chapter 3..." or "On page 47..."
4. Keep answers clear and concise — 2 to 4 paragraphs unless a longer answer is needed.
5. Match the language the user writes in.
6. Never make up information. Accuracy matters more than completeness.
"""


def format_qa_prompt(question: str, chunks: list, book_title: str) -> str:
    """Build the user message for a Q&A request."""
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        # Build a location string for citation
        parts = []
        if chunk.chapter_title:
            parts.append(f"Chapter: {chunk.chapter_title}")
        if chunk.page_number:
            parts.append(f"Page {chunk.page_number}")
        location = " | ".join(parts) if parts else f"Excerpt {i}"

        context_parts.append(
            f"[{location}]\n{chunk.parent_text}"  # note: parent_text, not child_text
        )

    context = "\n\n---\n\n".join(context_parts)

    return f"""Book: "{book_title}"

The following excerpts are from the book, ordered by relevance to your question:

{context}

---

Question: {question}

Please answer based on the excerpts above. Cite the chapter or page where helpful."""


# ── Summary prompts ──────────────────────────────────────────────────────────
SUMMARY_SECTION_PROMPT = """Summarise the following passage in 2-4 sentences.
Be concise. Capture the key idea or argument. Keep important names and facts.

Passage:
{text}

Summary:"""

SUMMARY_CHAPTER_PROMPT = """Write a chapter summary based on the section summaries below.
The summary should be 1-2 paragraphs covering the main theme and key points.
Write in a way that helps readers understand what they'll learn from this chapter.

Chapter: {chapter_title}

Sections:
{section_summaries}

Chapter summary:"""

SUMMARY_BOOK_PROMPT = """Write a comprehensive book summary for readers considering buying or reading this book.

Structure your summary as:
1. Opening paragraph: What is this book about and who is it for?
2. Main content (2-3 paragraphs): Key ideas, arguments, and insights
3. Closing sentence: What will the reader gain?

Book: {book_title}

Chapter summaries:
{chapter_summaries}

Book summary:"""
