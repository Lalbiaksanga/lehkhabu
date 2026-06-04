from __future__ import annotations

"""
Query expansion: generate paraphrases before embedding.

Why this helps:
A user might ask "What are the key ideas in this book?"
The book text might say "The central thesis is..." or "The author argues..."
These phrases have different vector representations but mean similar things.

By generating 2 paraphrases and averaging the 3 embeddings,
we cover more semantic ground and find more relevant chunks.
"""
import google.generativeai as genai
from app.core.config import settings, configure_gemini


EXPANSION_PROMPT = """You are helping improve a search query for a book Q&A system.
Given the user's question, write 2 alternative phrasings that mean the same thing.
The alternatives should use different vocabulary that might appear in book text.

Original question: {question}

Write exactly 2 alternative phrasings, one per line. No numbering, no explanation."""


async def expand_query(question: str) -> list[str]:
    """
    Return [original_question, paraphrase_1, paraphrase_2].
    Falls back to [original_question] if Gemini call fails.
    """
    try:
        configure_gemini()
        model = genai.GenerativeModel(settings.qa_model)
        response = await model.generate_content_async(
            EXPANSION_PROMPT.format(question=question),
            generation_config=genai.GenerationConfig(
                max_output_tokens=100,
                temperature=0.7,
            ),
        )
        alternatives = [
            line.strip()
            for line in response.text.strip().split("\n")
            if line.strip()
        ]
        return [question] + alternatives[:2]  # original + up to 2 paraphrases
    except Exception:
        return [question]  # graceful fallback — still works, just without expansion
