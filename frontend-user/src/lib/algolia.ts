import { algoliasearch } from 'algoliasearch';

// ── Algolia Configuration ─────────────────────────────────────────────────────
// VITE_ALGOLIA_APP_ID and VITE_ALGOLIA_SEARCH_KEY must be set in .env
// These are SEARCH-ONLY keys — safe to expose to the browser.
// The Admin API key must NEVER be exposed here.

const APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID as string | undefined;
const SEARCH_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_KEY as string | undefined;

export const ALGOLIA_BOOKS_INDEX = import.meta.env.VITE_ALGOLIA_BOOKS_INDEX as string ?? 'lehkhabu_books';

/** Whether Algolia is configured (both env vars present) */
export const isAlgoliaConfigured = !!(APP_ID && SEARCH_KEY);

/**
 * Algolia search client.
 * Will be undefined if env vars are not configured — callers must check
 * `isAlgoliaConfigured` before using this.
 */
export const algoliaClient = isAlgoliaConfigured
  ? algoliasearch(APP_ID!, SEARCH_KEY!)
  : null;
