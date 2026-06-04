/**
 * AI Service — LOCAL DEV MODE
 * 
 * Connects directly to backend-ai at localhost:8001.
 * The x-internal-key header is sent with every request.
 * 
 * TODO: In production, switch back to the Supabase Edge Function
 * `ai-proxy` so the internal key never touches the browser.
 */

// ── Backend-AI URL (local dev) ───────────────────────────────────────
const BACKEND_AI_URL = 'http://localhost:8001';
const INTERNAL_API_KEY = 'f34059fb2b7a0ef65024c7349a0bddadb3970500fefdbb4b7d9afcfb943aece4';

// ── Types ────────────────────────────────────────────────────────────
export interface QASource {
  chapter?: string;
  page?: number;
  relevance: number;
}

export interface QAStreamEvent {
  text?: string;
  cached?: boolean;
  sources?: QASource[];
  error?: string;
  done: boolean;
}

export interface BookSummary {
  book_id: string;
  level: string;
  summary: string;
  cached: boolean;
}

export interface ChapterSummary {
  chapter_index: number;
  chapter_title: string;
  summary: string;
}

// ── Internal Key Headers ─────────────────────────────────────────────
function getInternalHeaders(): Record<string, string> {
  return {
    'x-internal-key': INTERNAL_API_KEY,
  };
}

// ── Stream Q&A Answer ────────────────────────────────────────────────
/**
 * Stream a Q&A answer for a book using SSE.
 * 
 * Calls: GET /qa?book_id=...&question=...&book_title=...
 * 
 * @param bookId - UUID of the book
 * @param question - User's question
 * @param bookTitle - Title for prompt context
 * @param onEvent - Callback fired for each SSE event
 * @returns AbortController to cancel the stream
 */
export function streamBookQA(
  bookId: string,
  question: string,
  bookTitle: string,
  onEvent: (event: QAStreamEvent) => void,
): AbortController {
  const controller = new AbortController();

  const params = new URLSearchParams({
    book_id: bookId,
    question,
    book_title: bookTitle,
  });

  (async () => {
    try {
      const response = await fetch(`${BACKEND_AI_URL}/qa?${params.toString()}`, {
        method: 'GET',
        headers: getInternalHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onEvent({
          error: errorData.error || errorData.detail || `Request failed (${response.status})`,
          done: true,
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ error: 'No response body', done: true });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: QAStreamEvent = JSON.parse(line.slice(6));
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const event: QAStreamEvent = JSON.parse(buffer.slice(6));
          onEvent(event);
        } catch {
          // Skip
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({
          error: err instanceof Error ? err.message : 'Stream failed',
          done: true,
        });
      }
    }
  })();

  return controller;
}

// ── Get Book Summary ─────────────────────────────────────────────────
/**
 * Fetch the full book summary. Returns null if no summary exists
 * (book hasn't been ingested).
 * 
 * Calls: GET /summarize/{bookId}
 */
export async function getBookSummary(bookId: string): Promise<BookSummary | null> {
  try {
    const response = await fetch(`${BACKEND_AI_URL}/summarize/${bookId}`, {
      method: 'GET',
      headers: getInternalHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) return null;

    return await response.json() as BookSummary;
  } catch {
    return null;
  }
}

// ── Get Chapter Summaries ────────────────────────────────────────────
/**
 * Fetch all chapter summaries for a book.
 * Returns null if no chapters found.
 * 
 * Calls: GET /summarize/{bookId}/chapters
 */
export async function getChapterSummaries(bookId: string): Promise<ChapterSummary[] | null> {
  try {
    const response = await fetch(`${BACKEND_AI_URL}/summarize/${bookId}/chapters`, {
      method: 'GET',
      headers: getInternalHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) return null;

    const data = await response.json();
    return data.chapters as ChapterSummary[];
  } catch {
    return null;
  }
}
