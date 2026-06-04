import { supabase } from '../lib/supabase';

/* ── Types ──────────────────────────────────────────────────────── */

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// 7-stage publishing workflow
export type BookStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_CHANGES'
  | 'PUBLISHED';

export interface AuthorApplication {
  id: string;
  user_id: string;
  writing_sample: string;
  motivation: string;
  genre: string;
  social_links?: string;
  sample_file_url?: string;
  sample_file_name?: string;
  status: ApplicationStatus;
  admin_notes?: string;
  reviewed_by?: string;
  submitted_at: string;
  reviewed_at?: string;
}

export interface AuthorBook {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  description: string | null;
  language: string;
  category: string;
  tags: string[];
  isbn: string | null;
  cover_image_url: string | null;
  file_url: string | null;
  cover_color_primary: string | null;
  cover_color_secondary: string | null;
  price: number;
  is_free: boolean;
  total_pages: number | null;
  preview_pages: number | null;
  average_rating: number;
  rating_count: number;
  purchase_count: number;
  view_count: number;
  status: BookStatus;
  admin_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorAnalytics {
  totalBooks: number;
  publishedBooks: number;
  pendingBooks: number;
  totalPurchases: number;
  freeClaims: number;
  paidPurchases: number;
  totalRevenue: number;
  avgRating: number;
  totalViews: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ── Author Applications ─────────────────────────────────────────── */

/** Upload a sample file to the application-files bucket */
export async function uploadApplicationFile(userId: string, file: File): Promise<{ url: string; name: string }> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('application-files')
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`File upload failed: ${error.message}`);

  const { data: signed, error: signErr } = await supabase.storage
    .from('application-files')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (signErr) throw signErr;
  return { url: signed.signedUrl, name: file.name };
}

/** Submit an author application */
export async function submitAuthorApplication(payload: {
  userId: string;
  writingSample: string;
  motivation: string;
  genre: string;
  socialLinks?: string;
  sampleFileUrl?: string;
  sampleFileName?: string;
}): Promise<AuthorApplication> {
  const { data: existing } = await supabase
    .from('author_applications')
    .select('id, status')
    .eq('user_id', payload.userId)
    .in('status', ['PENDING', 'APPROVED'])
    .maybeSingle();

  if (existing) {
    if (existing.status === 'APPROVED') throw new Error('You are already an approved author.');
    throw new Error('You already have a pending application.');
  }

  const { data, error } = await supabase
    .from('author_applications')
    .insert({
      user_id: payload.userId,
      writing_sample: payload.writingSample,
      motivation: payload.motivation,
      genre: payload.genre,
      social_links: payload.socialLinks ?? null,
      sample_file_url: payload.sampleFileUrl ?? null,
      sample_file_name: payload.sampleFileName ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AuthorApplication;
}

/** Fetch the latest author application for a user */
export async function fetchMyApplication(userId: string): Promise<AuthorApplication | null> {
  const { data, error } = await supabase
    .from('author_applications')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as AuthorApplication | null;
}

/* ── Author Books ───────────────────────────────────────────────── */

/** Get current user's author profile */
export async function fetchMyAuthorProfile(userId: string) {
  const { data, error } = await supabase
    .from('author_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Load ALL author dashboard data in ONE round trip via SECURITY DEFINER RPC.
 * Returns { authorProfile, books, analytics } or throws on error.
 * Falls back gracefully on RPC unavailability.
 */
export async function fetchAuthorDashboard(userId: string): Promise<{
  authorProfile: Record<string, unknown> | null;
  books: AuthorBook[];
  analytics: AuthorAnalytics;
}> {
  const { data, error } = await supabase.rpc('get_author_dashboard', { p_user_id: userId });

  if (error || !data || data.error) {
    // Fallback: run queries separately
    const profile = await fetchMyAuthorProfile(userId);
    if (!profile) {
      return {
        authorProfile: null,
        books: [],
        analytics: { totalBooks: 0, publishedBooks: 0, pendingBooks: 0, totalPurchases: 0, freeClaims: 0, paidPurchases: 0, totalRevenue: 0, avgRating: 0, totalViews: 0 },
      };
    }
    const books = await fetchMyBooks(profile.id);
    const analytics = await fetchAuthorAnalytics(profile.id);
    return { authorProfile: profile, books, analytics };
  }

  const raw = data as { author_profile: Record<string, unknown>; books: AuthorBook[] | null; analytics: Record<string, number> };
  const an = raw.analytics ?? {};

  return {
    authorProfile: raw.author_profile ?? null,
    books: (raw.books ?? []) as AuthorBook[],
    analytics: {
      totalBooks: (an.total_books as number) ?? 0,
      publishedBooks: (an.published_books as number) ?? 0,
      pendingBooks: (an.pending_books as number) ?? 0,
      totalPurchases: (an.total_purchases as number) ?? 0,
      freeClaims: 0,
      paidPurchases: (an.total_purchases as number) ?? 0,
      totalRevenue: (an.total_revenue as number) ?? 0,
      avgRating: Number((an.avg_rating as number ?? 0).toFixed(2)),
      totalViews: (an.total_views as number) ?? 0,
    },
  };
}

/** Fetch all books by the current author (all statuses) */
export async function fetchMyBooks(authorProfileId: string): Promise<AuthorBook[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('author_id', authorProfileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AuthorBook[];
}

/** Upload a book cover image */
export async function uploadBookCover(authorId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${authorId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('book-covers')
    .upload(path, file, { upsert: true, cacheControl: '3600' });

  if (error) throw new Error(`Cover upload failed: ${error.message}`);

  const { data } = supabase.storage.from('book-covers').getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a book file (PDF / EPUB / DOCX) — returns the raw storage path, NOT a signed URL */
export async function uploadBookFile(authorId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${authorId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('book-files')
    .upload(path, file, { upsert: true });

  if (error) throw new Error(`File upload failed: ${error.message}`);

  // Return the raw storage path — signed URLs are generated on-demand when reading
  return path;
}

/**
 * Generate a fresh signed URL for a book file.
 * Call this when the user opens the reader, not at upload time.
 * The URL is valid for 1 hour.
 */
export async function getBookFileSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('book-files')
    .createSignedUrl(storagePath, 60 * 60); // 1 hour

  if (error) throw new Error(`Failed to generate download URL: ${error.message}`);
  return data.signedUrl;
}

/** Create a new book as DRAFT */
export async function createBook(payload: {
  authorProfileId: string;
  title: string;
  description: string;
  language: string;
  category: string;
  tags: string[];
  price: number;
  isFree: boolean;
  totalPages?: number;
  previewPages?: number;
  isbn?: string;
  coverImageUrl?: string;
  fileUrl?: string;
  coverColorPrimary?: string;
  coverColorSecondary?: string;
}): Promise<AuthorBook> {
  const slug = `${payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from('books')
    .insert({
      author_id: payload.authorProfileId,
      title: payload.title,
      slug,
      description: payload.description,
      language: payload.language,
      category: payload.category,
      tags: payload.tags,
      price: payload.price,
      is_free: payload.isFree,
      total_pages: payload.totalPages ?? null,
      preview_pages: payload.previewPages ?? 0,
      isbn: payload.isbn ?? null,
      cover_image_url: payload.coverImageUrl ?? null,
      file_url: payload.fileUrl ?? null,
      cover_color_primary: payload.coverColorPrimary ?? null,
      cover_color_secondary: payload.coverColorSecondary ?? null,
      status: 'DRAFT',  // Always starts as DRAFT — admin approval required
    })
    .select()
    .single();

  if (error) throw error;
  return data as AuthorBook;
}

/** Update an existing book */
export async function updateBook(bookId: string, updates: Partial<{
  title: string;
  description: string;
  language: string;
  category: string;
  tags: string[];
  price: number;
  isFree: boolean;
  totalPages: number;
  previewPages: number;
  isbn: string;
  coverImageUrl: string;
  fileUrl: string;
  coverColorPrimary: string;
  coverColorSecondary: string;
}>): Promise<AuthorBook> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.language !== undefined) dbUpdates.language = updates.language;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.price !== undefined) dbUpdates.price = updates.price;
  if (updates.isFree !== undefined) dbUpdates.is_free = updates.isFree;
  if (updates.totalPages !== undefined) dbUpdates.total_pages = updates.totalPages;
  if (updates.previewPages !== undefined) dbUpdates.preview_pages = updates.previewPages;
  if (updates.isbn !== undefined) dbUpdates.isbn = updates.isbn;
  if (updates.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates.coverImageUrl;
  if (updates.fileUrl !== undefined) dbUpdates.file_url = updates.fileUrl;
  if (updates.coverColorPrimary !== undefined) dbUpdates.cover_color_primary = updates.coverColorPrimary;
  if (updates.coverColorSecondary !== undefined) dbUpdates.cover_color_secondary = updates.coverColorSecondary;
  dbUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('books')
    .update(dbUpdates)
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data as AuthorBook;
}

/** Submit a DRAFT book for admin review */
export async function submitBookForReview(bookId: string): Promise<AuthorBook> {
  const { data, error } = await supabase
    .from('books')
    .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data as AuthorBook;
}

/** Resubmit a NEEDS_CHANGES book after addressing feedback */
export async function resubmitBook(bookId: string): Promise<AuthorBook> {
  const { data, error } = await supabase
    .from('books')
    .update({ status: 'SUBMITTED', admin_notes: null, submitted_at: new Date().toISOString() })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data as AuthorBook;
}

/** Delete a book (only DRAFT or REJECTED can be deleted by author) */
export async function deleteBook(bookId: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', bookId);
  if (error) throw error;
}

/** Fetch author analytics */
export async function fetchAuthorAnalytics(authorProfileId: string): Promise<AuthorAnalytics> {
  const [booksRes, purchasesRes] = await Promise.all([
    supabase.from('books').select('status, average_rating, view_count, is_free').eq('author_id', authorProfileId),
    supabase.from('purchases')
      .select('is_free, amount_paid, status')
      .in('book_id', 
        await supabase.from('books').select('id').eq('author_id', authorProfileId)
          .then(r => (r.data ?? []).map((b: { id: string }) => b.id))
      )
      .eq('status', 'COMPLETED'),
  ]);

  const books = booksRes.data ?? [];
  const purchases = purchasesRes.data ?? [];

  const published = books.filter(b => b.status === 'PUBLISHED');
  const pending = books.filter(b => ['SUBMITTED', 'UNDER_REVIEW'].includes(b.status));
  const freeClaims = purchases.filter((p: { is_free: boolean }) => p.is_free).length;
  const paidPurchases = purchases.filter((p: { is_free: boolean }) => !p.is_free).length;
  const totalRevenue = purchases.reduce((s: number, p: { amount_paid: number }) => s + (p.amount_paid ?? 0), 0);
  const ratingsWithValue = published.filter(b => (b.average_rating ?? 0) > 0);
  const avgRating = ratingsWithValue.length > 0
    ? ratingsWithValue.reduce((s, b) => s + b.average_rating, 0) / ratingsWithValue.length
    : 0;
  const totalViews = books.reduce((s, b) => s + (b.view_count ?? 0), 0);

  return {
    totalBooks: books.length,
    publishedBooks: published.length,
    pendingBooks: pending.length,
    totalPurchases: purchases.length,
    freeClaims,
    paidPurchases,
    totalRevenue,
    avgRating,
    totalViews,
  };
}

/* ── Notifications ──────────────────────────────────────────────── */

/**
 * Circuit breaker: once we get a 404 (table doesn't exist), stop hitting
 * the network for the rest of this page session. Resets on page reload.
 */
let _notificationsTableMissing = false;

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  if (_notificationsTableMissing) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    // Supabase returns code "PGRST204" or HTTP 404 when the table doesn't exist.
    // Also catch any "relation does not exist" messages.
    const msg = (error.message ?? '').toLowerCase();
    const code = (error as { code?: string }).code ?? '';
    if (code === 'PGRST204' || code === '42P01' || msg.includes('not found') || msg.includes('does not exist')) {
      _notificationsTableMissing = true;
      return [];
    }
    throw error;
  }
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export function subscribeToNotifications(
  userId: string,
  onNew: (notification: Notification) => void
) {
  const channelId = `notifications:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new as Notification)
    )
    .subscribe();
}

export function subscribeToUserRole(
  userId: string,
  onRoleChange: (newRole: string) => void
) {
  const channelId = `user-role:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new.role !== payload.old.role) {
          onRoleChange(payload.new.role as string);
        }
      }
    )
    .subscribe();
}

export function subscribeToApplicationStatus(
  userId: string,
  onStatusChange: (status: ApplicationStatus, adminNotes?: string) => void
) {
  const channelId = `application:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'author_applications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onStatusChange(payload.new.status as ApplicationStatus, payload.new.admin_notes);
      }
    )
    .subscribe();
}

/** Subscribe to real-time book status changes for an author */
export function subscribeToBookStatus(
  authorProfileId: string,
  onStatusChange: (bookId: string, status: BookStatus, adminNotes?: string) => void
) {
  const channelId = `book-status:${authorProfileId}:${Date.now()}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'books',
        filter: `author_id=eq.${authorProfileId}`,
      },
      (payload) => {
        onStatusChange(payload.new.id, payload.new.status as BookStatus, payload.new.admin_notes);
      }
    )
    .subscribe();
}
