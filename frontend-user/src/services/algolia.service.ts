/**
 * algolia.service.ts
 *
 * Handles syncing books from Supabase → Algolia.
 * This is an ADMIN-ONLY operation — requires the Algolia Admin API key.
 *
 * IMPORTANT: The Admin key is ONLY used server-side (e.g. admin panel or
 * Supabase Edge Function). This file is for the admin frontend only.
 * The search-only key in lib/algolia.ts is used for public search.
 */

import { fetchAllBooks } from './books.service';
import type { Book } from './books.service';

export interface AlgoliaBook {
  objectID: string; // Required by Algolia — maps to book.id
  id: string;
  title: string;
  author_name: string;
  category: string;
  description: string | null;
  language: string;
  tags: string[];
  average_rating: number;
  rating_count: number;
  purchase_count: number;
  price: number;
  is_free: boolean;
  cover_image_url: string | null;
  cover_color_primary: string | null;
  cover_color_secondary: string | null;
  slug: string;
  published_at: string | null;
  created_at: string;
  // For Algolia ranking
  _rankingInfo?: object;
}

/** Convert a Supabase Book to an Algolia record */
export function bookToAlgoliaRecord(book: Book): AlgoliaBook {
  return {
    objectID: book.id,
    id: book.id,
    title: book.title,
    author_name: book.author_name ?? 'Unknown Author',
    category: book.category,
    description: book.description,
    language: book.language,
    tags: book.tags ?? [],
    average_rating: book.average_rating,
    rating_count: book.rating_count,
    purchase_count: book.purchase_count,
    price: book.price,
    is_free: book.is_free,
    cover_image_url: book.cover_image_url,
    cover_color_primary: book.cover_color_primary,
    cover_color_secondary: book.cover_color_secondary,
    slug: book.slug,
    published_at: book.published_at,
    created_at: book.created_at,
  };
}

/**
 * Fetch all published books from Supabase and index them in Algolia.
 * Call this from the admin dashboard after publishing/updating books.
 *
 * Requires VITE_ALGOLIA_ADMIN_KEY to be set (admin panel only).
 */
export async function syncBooksToAlgolia(): Promise<{ count: number }> {
  const adminKey = import.meta.env.VITE_ALGOLIA_ADMIN_KEY as string | undefined;
  const appId = import.meta.env.VITE_ALGOLIA_APP_ID as string | undefined;
  const indexName = import.meta.env.VITE_ALGOLIA_BOOKS_INDEX as string ?? 'lehkhabu_books';

  if (!adminKey || !appId) {
    throw new Error('Algolia Admin Key (VITE_ALGOLIA_ADMIN_KEY) is not configured.');
  }

  // Dynamically import algoliasearch to avoid bloating the user bundle
  const { algoliasearch } = await import('algoliasearch');
  const adminClient = algoliasearch(appId, adminKey);

  const books = await fetchAllBooks({ limit: 5000 });
  const records = books.map(bookToAlgoliaRecord);

  await adminClient.saveObjects({ indexName, objects: records as unknown as Array<Record<string, unknown>> });

  return { count: records.length };
}

/**
 * Recommended Algolia index settings to apply once after creating the index.
 * Call from admin panel or a one-time setup script.
 */
export const RECOMMENDED_INDEX_SETTINGS = {
  searchableAttributes: [
    'unordered(title)',
    'unordered(author_name)',
    'unordered(category)',
    'unordered(tags)',
    'description',
  ],
  attributesForFaceting: [
    'filterOnly(is_free)',
    'category',
    'language',
    'tags',
  ],
  customRanking: [
    'desc(average_rating)',
    'desc(purchase_count)',
    'desc(rating_count)',
  ],
  ranking: [
    'typo',
    'geo',
    'words',
    'filters',
    'proximity',
    'attribute',
    'exact',
    'custom',
  ],
  typoTolerance: true,
  minWordSizefor1Typo: 4,
  minWordSizefor2Typos: 8,
  ignorePlurals: true,
  removeStopWords: true,
  queryLanguages: ['en'],
  attributesToRetrieve: ['*'],
  attributesToHighlight: ['title', 'author_name', 'description'],
  highlightPreTag: '<mark>',
  highlightPostTag: '</mark>',
  hitsPerPage: 20,
};
