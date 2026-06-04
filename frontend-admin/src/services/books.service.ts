import { supabase } from '../lib/supabase';

export type AdminBookStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_CHANGES' | 'PUBLISHED';

export interface AdminBook {
  id: string;
  title: string;
  author: string;
  authorId: string;
  category: string;
  price: number;
  isFree: boolean;
  status: AdminBookStatus;
  coverImageUrl?: string;
  coverColorPrimary?: string;
  coverColorSecondary?: string;
  totalPages?: number;
  wordCount?: number;
  averageRating: number;
  ratingCount: number;
  purchaseCount: number;
  language: string;
  description?: string;
  isbn?: string;
  tags: string[];
  adminNotes?: string;
  submittedAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  fileUrl?: string;
}

/** Fetch all books with author name joined from author_profiles + users */
export async function fetchBooks() {
  const { data, error } = await supabase
    .from('books')
    .select(`
      id, title, category, price, is_free, status, cover_image_url,
      cover_color_primary, cover_color_secondary, total_pages,
      average_rating, rating_count, purchase_count, language, description,
      isbn, tags, admin_notes, file_url, submitted_at, published_at, created_at, updated_at,
      author_profiles!books_author_id_fkey (
        id, pen_name,
        users ( full_name, email, username )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((b: any): AdminBook => {
    const ap = b.author_profiles;
    const u  = ap?.users;
    const authorName = ap?.pen_name ?? u?.full_name ?? u?.username ?? u?.email?.split('@')[0] ?? 'Unknown';
    return {
      id: b.id,
      title: b.title,
      author: authorName,
      authorId: ap?.id ?? '',
      category: b.category,
      price: b.price,
      isFree: b.is_free,
      status: b.status,
      coverImageUrl: b.cover_image_url,
      coverColorPrimary: b.cover_color_primary,
      coverColorSecondary: b.cover_color_secondary,
      totalPages: b.total_pages,
      averageRating: b.average_rating ?? 0,
      ratingCount: b.rating_count ?? 0,
      purchaseCount: b.purchase_count ?? 0,
      language: b.language,
      description: b.description,
      isbn: b.isbn,
      tags: b.tags ?? [],
      adminNotes: b.admin_notes,
      fileUrl: b.file_url,
      submittedAt: b.submitted_at,
      publishedAt: b.published_at,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    };
  });
}


/** Generic status update with optional admin notes */

export async function updateBookStatus(
  bookId: string,
  status: AdminBookStatus,
  adminNotes?: string
) {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (adminNotes !== undefined) updates.admin_notes = adminNotes;
  if (status === 'PUBLISHED') updates.published_at = new Date().toISOString();
  const { error } = await supabase.from('books').update(updates).eq('id', bookId);
  if (error) throw error;
}

/** Approve → auto-publish (trigger sends notification) */
export async function approveBook(bookId: string) {
  return updateBookStatus(bookId, 'PUBLISHED', undefined);
}

/** Reject with required reason */
export async function rejectBook(bookId: string, reason: string) {
  return updateBookStatus(bookId, 'REJECTED', reason);
}

/** Request changes with required feedback */
export async function requestChanges(bookId: string, feedback: string) {
  return updateBookStatus(bookId, 'NEEDS_CHANGES', feedback);
}

/** Mark as under review (admin picks it up) */
export async function markUnderReview(bookId: string) {
  return updateBookStatus(bookId, 'UNDER_REVIEW');
}

/** Delete a book */
export async function deleteBook(bookId: string) {
  const { error } = await supabase.from('books').delete().eq('id', bookId);
  if (error) throw error;
}

/** Fetch genre distribution */
export async function fetchGenreDistribution() {
  const { data, error } = await supabase
    .from('books')
    .select('category')
    .eq('status', 'PUBLISHED');
  if (error) throw error;

  const counts: Record<string, number> = {};
  (data ?? []).forEach((b: any) => {
    const cat = b.category || 'Other';
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const COLORS = ['#C17817', '#4F8EF7', '#34D399', '#A78BFA', '#F87171', '#FB923C', '#22D3EE', '#6EE7B7', '#F472B6', '#FBBF24'];
  return Object.entries(counts).map(([genre, count], i) => ({
    genre,
    count,
    color: COLORS[i % COLORS.length],
  }));
}
