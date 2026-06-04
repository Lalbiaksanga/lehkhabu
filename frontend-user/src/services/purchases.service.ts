import { supabase } from '../lib/supabase';

export interface Purchase {
  id: string;
  user_id: string;
  book_id: string;
  amount_paid: number;
  is_free: boolean;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  payment_ref: string | null;
  purchased_at: string;
}

/** Check if user owns a book */
export async function checkOwnership(userId: string, bookId: string): Promise<boolean> {
  const { data } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .eq('status', 'COMPLETED')
    .maybeSingle();
  return data !== null;
}

/** Claim a free book (creates ownership record) */
export async function claimFreeBook(userId: string, bookId: string): Promise<Purchase> {
  // Validate book is actually free server-side
  const { data: book, error: bookErr } = await supabase
    .from('books')
    .select('id, is_free, price, status')
    .eq('id', bookId)
    .eq('status', 'PUBLISHED')
    .single();

  if (bookErr || !book) throw new Error('Book not found or not published.');
  if (!book.is_free) throw new Error('This book is not free.');

  // Check not already owned
  const alreadyOwned = await checkOwnership(userId, bookId);
  if (alreadyOwned) throw new Error('You already own this book.');

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      user_id: userId,
      book_id: bookId,
      amount_paid: 0,
      is_free: true,
      status: 'COMPLETED',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('You already own this book.');
    throw error;
  }
  return data as Purchase;
}

/** Initiate a paid purchase (simplified — in production integrate Razorpay) */
export async function purchaseBook(
  userId: string,
  bookId: string,
  paymentRef?: string
): Promise<Purchase> {
  const { data: book, error: bookErr } = await supabase
    .from('books')
    .select('id, is_free, price, status')
    .eq('id', bookId)
    .eq('status', 'PUBLISHED')
    .single();

  if (bookErr || !book) throw new Error('Book not found or not published.');
  if (book.is_free) return claimFreeBook(userId, bookId);
  if (book.price <= 0) throw new Error('Invalid book price.');

  const alreadyOwned = await checkOwnership(userId, bookId);
  if (alreadyOwned) throw new Error('You already own this book.');

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      user_id: userId,
      book_id: bookId,
      amount_paid: book.price,
      is_free: false,
      status: 'COMPLETED', // Set to COMPLETED after payment verification
      payment_ref: paymentRef ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('You already own this book.');
    throw error;
  }
  return data as Purchase;
}

/** Fetch all purchases for a user */
export async function fetchUserPurchases(userId: string) {
  const { data, error } = await supabase
    .from('purchases')
    .select(`*, books (id, title, author_id, category, cover_image_url, cover_color_primary, cover_color_secondary, average_rating, price, is_free, total_pages, status, slug)`)
    .eq('user_id', userId)
    .eq('status', 'COMPLETED')
    .order('purchased_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
