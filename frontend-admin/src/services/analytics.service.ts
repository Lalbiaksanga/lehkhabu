import { supabase } from '../lib/supabase';

export interface DashboardStats {
  totalBooks: number;
  publishedBooks: number;
  pendingBooks: number;    // SUBMITTED + UNDER_REVIEW
  draftBooks: number;
  rejectedBooks: number;
  totalUsers: number;
  totalAuthors: number;
  totalPurchases: number;
  totalRevenue: number;
  pendingApplications: number;
  totalAnnouncements: number;
  activeAnnouncements: number;
}

/** Fetch all dashboard stats — runs in parallel, no mock data */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [
    totalBooksRes, publishedRes, submittedRes, underReviewRes,
    draftRes, rejectedRes, totalUsersRes, totalAuthorsRes,
    totalPurchasesRes, pendingAppsRes, totalAnnouncementsRes, activeAnnouncementsRes, revenueRes,
  ] = await Promise.all([
    supabase.from('books').select('*', { count: 'exact', head: true }),
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'UNDER_REVIEW'),
    supabase.from('books').select('*', { count: 'exact', head: true }).eq('status', 'DRAFT'),
    supabase.from('books').select('*', { count: 'exact', head: true }).in('status', ['REJECTED','NEEDS_CHANGES']),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'AUTHOR'),
    supabase.from('purchases').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
    supabase.from('author_applications').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('announcements').select('*', { count: 'exact', head: true }),
    supabase.from('announcements').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('purchases').select('amount_paid').eq('status', 'COMPLETED').eq('is_free', false),
  ]);

  const totalRevenue = (revenueRes.data ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, p: any) => s + (p.amount_paid ?? 0), 0
  );

  return {
    totalBooks:          totalBooksRes.count       ?? 0,
    publishedBooks:      publishedRes.count        ?? 0,
    pendingBooks:        (submittedRes.count ?? 0) + (underReviewRes.count ?? 0),
    draftBooks:          draftRes.count            ?? 0,
    rejectedBooks:       rejectedRes.count         ?? 0,
    totalUsers:          totalUsersRes.count       ?? 0,
    totalAuthors:        totalAuthorsRes.count     ?? 0,
    totalPurchases:      totalPurchasesRes.count   ?? 0,
    totalRevenue,
    pendingApplications: pendingAppsRes.count      ?? 0,
    totalAnnouncements:  totalAnnouncementsRes.count ?? 0,
    activeAnnouncements: activeAnnouncementsRes.count ?? 0,
  };
}

/** Fetch recent purchases (join with users + books) */
export async function fetchRecentPurchases(limit = 6) {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      id, amount_paid, is_free, status, purchased_at,
      users ( full_name, username, email, avatar_url ),
      books ( title, cover_color_primary )
    `)
    .order('purchased_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    amount: p.amount_paid ?? 0,
    isFree: p.is_free,
    status: p.status,
    purchasedAt: p.purchased_at,
    userName: p.users?.full_name ?? p.users?.username ?? p.users?.email?.split('@')[0] ?? 'Unknown',
    userEmail: p.users?.email ?? '',
    bookTitle: p.books?.title ?? 'Deleted Book',
    coverColor: p.books?.cover_color_primary ?? '#C17817',
  }));
}

/** Fetch top performing books by purchase count */
export async function fetchTopBooks(limit = 5) {
  const { data, error } = await supabase
    .from('books')
    .select(`
      id, title, category, price, average_rating, rating_count, purchase_count, status,
      cover_color_primary, language,
      author_profiles ( pen_name, users ( full_name ) )
    `)
    .eq('status', 'PUBLISHED')
    .order('purchase_count', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((b: any) => ({
    id: b.id,
    title: b.title,
    author: b.author_profiles?.pen_name ?? b.author_profiles?.users?.full_name ?? 'Unknown',
    category: b.category,
    price: b.price,
    averageRating: b.average_rating ?? 0,
    ratingCount: b.rating_count ?? 0,
    purchaseCount: b.purchase_count ?? 0,
    status: b.status,
    coverColor: b.cover_color_primary ?? '#C17817',
    language: b.language,
    revenue: (b.price ?? 0) * (b.purchase_count ?? 0),
  }));
}

/** Fetch books awaiting review (SUBMITTED first, then UNDER_REVIEW) */
export async function fetchPendingBooks(limit = 5) {
  const { data, error } = await supabase
    .from('books')
    .select(`
      id, title, category, submitted_at, cover_color_primary,
      author_profiles ( pen_name, users ( full_name ) )
    `)
    .in('status', ['SUBMITTED', 'UNDER_REVIEW'])
    .order('submitted_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((b: any) => ({
    id: b.id,
    title: b.title,
    category: b.category,
    submittedAt: b.submitted_at,
    coverColor: b.cover_color_primary ?? '#C17817',
    author: b.author_profiles?.pen_name ?? b.author_profiles?.users?.full_name ?? 'Unknown',
  }));
}

/** Fetch top authors by total_sales */
export async function fetchTopAuthors(limit = 4) {
  const { data, error } = await supabase
    .from('author_profiles')
    .select(`
      id, total_books, total_sales,
      users ( full_name, username, avatar_url )
    `)
    .order('total_sales', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((a: any) => ({
    id: a.id,
    totalBooks: a.total_books ?? 0,
    totalSales: a.total_sales ?? 0,
    name: a.users?.full_name ?? a.users?.username ?? 'Unknown',
    avatar: a.users?.avatar_url,
  }));
}

/** Fetch genre distribution of published books */
export async function fetchGenreDistribution() {
  const { data, error } = await supabase
    .from('books')
    .select('category')
    .eq('status', 'PUBLISHED');
  if (error) throw error;

  const counts: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data ?? []).forEach((b: any) => {
    const cat = b.category || 'Other';
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const COLORS = ['#C17817','#4F8EF7','#34D399','#A78BFA','#F87171','#FB923C','#22D3EE','#6EE7B7','#F472B6','#FBBF24'];
  return Object.entries(counts).map(([genre, count], i) => ({
    genre, count, color: COLORS[i % COLORS.length],
  }));
}
