import { supabase } from '../lib/supabase';

export interface Book {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  description: string | null;
  language: string;
  category: string;
  tags: string[];
  cover_image_url: string | null;
  file_url: string | null;
  cover_color_primary: string | null;
  cover_color_secondary: string | null;
  price: number;
  is_free: boolean;
  total_pages: number | null;
  average_rating: number;
  rating_count: number;
  purchase_count: number;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  published_at: string | null;
  created_at: string;
  // Joined from author_profiles -> users
  author_name?: string;
}

export interface ShelfEntry {
  id: string;
  user_id: string;
  book_id: string;
  shelf: 'WANT_TO_READ' | 'READING' | 'READ';
  added_at: string;
  book?: Book;
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  current_page: number;
  percentage: number;
  last_read_at: string;
}

/** Fetch all published books with author name joined */
export async function fetchAllBooks({
  category,
  search,
  limit = 100,
}: { category?: string; search?: string; limit?: number } = {}) {
  let query = supabase
    .from('books')
    .select(`
      *,
      author_profiles (
        pen_name,
        users (full_name, username)
      )
    `)
    .eq('status', 'PUBLISHED')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (category) query = query.eq('category', category);
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(normalizeBook);
}

/** Fetch a single published book by ID */
export async function fetchBookById(id: string) {
  const { data, error } = await supabase
    .from('books')
    .select(`
      *,
      author_profiles (
        pen_name,
        users (full_name, username)
      )
    `)
    .eq('id', id)
    .eq('status', 'PUBLISHED')
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeBook(data) : null;
}

/** Fetch books for a given author_profile_id */
export async function fetchAuthorBooks(authorProfileId: string) {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('author_id', authorProfileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeBook);
}

/** Normalize the raw Supabase row + joined author */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBook(raw: any): Book {
  const authorProfile = raw.author_profiles;
  const authorUser = authorProfile?.users;
  const authorName =
    authorProfile?.pen_name ||
    authorUser?.full_name ||
    authorUser?.username ||
    'Unknown Author';

  return {
    id: raw.id,
    author_id: raw.author_id,
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    language: raw.language,
    category: raw.category,
    tags: raw.tags ?? [],
    cover_image_url: raw.cover_image_url,
    file_url: raw.file_url,
    cover_color_primary: raw.cover_color_primary,
    cover_color_secondary: raw.cover_color_secondary,
    price: raw.price,
    is_free: raw.is_free,
    total_pages: raw.total_pages,
    average_rating: raw.average_rating,
    rating_count: raw.rating_count,
    purchase_count: raw.purchase_count,
    status: raw.status,
    published_at: raw.published_at,
    created_at: raw.created_at,
    author_name: authorName,
  };
}

/* ── SHELF / WISHLIST ─────────────────────────────────────────── */

/** Get all shelf entries for a user (with book data) */
export async function fetchUserShelf(userId: string, shelf?: ShelfEntry['shelf']) {
  let query = supabase
    .from('shelf_entries')
    .select(`
      *,
      books (
        id, title, author_id, category, cover_image_url,
        cover_color_primary, cover_color_secondary, average_rating,
        price, is_free, total_pages, status, slug, description,
        language, tags, rating_count, purchase_count,
        published_at, created_at,
        author_profiles (
          pen_name,
          users (full_name, username)
        )
      )
    `)
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (shelf) query = query.eq('shelf', shelf);

  const { data, error } = await query;
  if (error) throw error;

  // Normalize author_name inside shelf book entries
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const book = row.books as Record<string, unknown> | null;
    if (book) {
      const ap = book.author_profiles as Record<string, unknown> | null;
      const u  = ap?.users as Record<string, unknown> | null;
      (book as Record<string, unknown>).author_name =
        ap?.pen_name ?? u?.full_name ?? u?.username ?? 'Unknown Author';
    }
    return row;
  });
}


/** Add a book to a user's shelf (or move between shelves) */
export async function upsertShelfEntry(
  userId: string,
  bookId: string,
  shelf: ShelfEntry['shelf']
) {
  const { data, error } = await supabase
    .from('shelf_entries')
    .upsert(
      { user_id: userId, book_id: bookId, shelf },
      { onConflict: 'user_id,book_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Remove a book from the shelf entirely */
export async function removeShelfEntry(userId: string, bookId: string) {
  const { error } = await supabase
    .from('shelf_entries')
    .delete()
    .eq('user_id', userId)
    .eq('book_id', bookId);
  if (error) throw error;
}

/* ── READING PROGRESS ─────────────────────────────────────────── */

/** Get reading progress for a specific book */
export async function fetchReadingProgress(userId: string, bookId: string) {
  const { data, error } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();
  if (error) throw error;
  return data as ReadingProgress | null;
}

/** Get all reading progress entries for a user (used for homepage dashboard) */
export async function fetchAllReadingProgress(userId: string): Promise<ReadingProgress[]> {
  const { data, error } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as ReadingProgress[];
}

/** Save/update reading progress */
export async function saveReadingProgress(
  userId: string,
  bookId: string,
  currentPage: number,
  totalPages: number
) {
  const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const { error } = await supabase
    .from('reading_progress')
    .upsert(
      {
        user_id: userId,
        book_id: bookId,
        current_page: currentPage,
        percentage,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,book_id' }
    );
  if (error) throw error;
}

/* ── PURCHASES ────────────────────────────────────────────────── */

/** Check if a user has purchased a book */
export async function checkPurchase(userId: string, bookId: string) {
  const { data } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .eq('status', 'COMPLETED')
    .maybeSingle();
  return data !== null;
}

/** Fetch all purchases for a user */
export async function fetchUserPurchases(userId: string) {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      *,
      books (id, title, author_id, category, cover_image_url, cover_color_primary, cover_color_secondary, average_rating, price, is_free, total_pages, status)
    `)
    .eq('user_id', userId)
    .eq('status', 'COMPLETED')
    .order('purchased_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Author application helpers live in author.service.ts to avoid duplication.
