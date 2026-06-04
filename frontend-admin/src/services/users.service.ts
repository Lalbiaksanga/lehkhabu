import { supabase } from '../lib/supabase';

/* ── Types ───────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: 'USER' | 'AUTHOR' | 'ADMIN';
  isActive: boolean;
  isEmailVerified: boolean;
  avatarUrl?: string;
  bio?: string;
  followersCount: number;
  followingCount: number;
  createdAt: string;
  updatedAt: string;
  purchaseCount: number;
  totalSpent: number;
}

export interface AdminAuthorProfile {
  id: string;
  userId: string;
  penName?: string;
  website?: string;
  totalBooks: number;
  totalSales: number;
  createdAt: string;
  user?: AdminUser;
}

export interface AdminApplication {
  id: string;
  userId: string;
  writingSample: string;
  motivation: string;
  genre: string;
  socialLinks?: string;
  sampleFileName?: string;
  sampleFileUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  reviewedBy?: string;
  submittedAt: string;
  reviewedAt?: string;
  // joined
  userName: string;
  userEmail: string;
  userAvatar?: string;
}

/* ── Users ───────────────────────────────────────────────────────── */

/** Fetch all users (admin only — requires Admin SELECT RLS policy) */
export async function fetchUsers(): Promise<AdminUser[]> {
  // Run both queries in parallel to eliminate sequential loading delay
  const [usersRes, purchaseRes] = await Promise.all([
    supabase
      .from('users')
      .select(
        'id, email, username, full_name, role, is_active, is_email_verified, avatar_url, bio, followers_count, following_count, created_at, updated_at'
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('purchases')
      .select('user_id, amount_paid')
      .eq('status', 'COMPLETED'),
  ]);

  if (usersRes.error) throw usersRes.error;

  // Aggregate purchase stats per user from parallel response
  const statsByUser: Record<string, { count: number; spent: number }> = {};
  (purchaseRes.data ?? []).forEach((p: { user_id: string; amount_paid: number | null }) => {
    if (!statsByUser[p.user_id]) statsByUser[p.user_id] = { count: 0, spent: 0 };
    statsByUser[p.user_id].count += 1;
    statsByUser[p.user_id].spent += p.amount_paid ?? 0;
  });

  return (usersRes.data ?? []).map((u: {
    id: string; email: string; username: string; full_name: string;
    role: AdminUser['role']; is_active: boolean; is_email_verified: boolean;
    avatar_url?: string; bio?: string; followers_count?: number;
    following_count?: number; created_at: string; updated_at: string;
  }): AdminUser => ({
    id: u.id,
    email: u.email,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    isActive: u.is_active,
    isEmailVerified: u.is_email_verified,
    avatarUrl: u.avatar_url,
    bio: u.bio,
    followersCount: u.followers_count ?? 0,
    followingCount: u.following_count ?? 0,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    purchaseCount: statsByUser[u.id]?.count ?? 0,
    totalSpent: statsByUser[u.id]?.spent ?? 0,
  }));
}

/** Update user active status */
export async function updateUserActive(userId: string, isActive: boolean) {
  const { error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * Update user role via the DB function that enforces the application requirement.
 * Only USER → AUTHOR (if approved) or AUTHOR → USER are allowed.
 * Setting role to ADMIN is blocked at both frontend and DB level.
 */
export async function updateUserRole(userId: string, role: 'USER' | 'AUTHOR') {
  // Hard frontend guard
  if ((role as string) === 'ADMIN') {
    throw new Error('Assigning the ADMIN role is strictly prohibited.');
  }

  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_new_role: role,
  });

  if (error) throw error;
}

/* ── Author Profiles ─────────────────────────────────────────────── */

/** Fetch author profiles with joined user info */
export async function fetchAuthors(): Promise<AdminAuthorProfile[]> {
  const { data, error } = await supabase
    .from('author_profiles')
    .select(`
      id, user_id, pen_name, website, total_books, total_sales, created_at,
      users!author_profiles_user_id_fkey (
        id, email, username, full_name, avatar_url, is_active, created_at, role
      )
    `)
    .order('total_sales', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((a: any): AdminAuthorProfile => ({
    id: a.id,
    userId: a.user_id,
    penName: a.pen_name,
    website: a.website,
    totalBooks: a.total_books,
    totalSales: a.total_sales,
    createdAt: a.created_at,
    user: a.users ? {
      id: a.users.id,
      email: a.users.email,
      username: a.users.username,
      fullName: a.users.full_name,
      role: a.users.role,
      isActive: a.users.is_active,
      isEmailVerified: false,
      followersCount: 0,
      followingCount: 0,
      createdAt: a.users.created_at,
      updatedAt: a.users.created_at,
      purchaseCount: 0,
      totalSpent: 0,
    } : undefined,
  }));
}

/* ── Applications ────────────────────────────────────────────────── */

/** Fetch all author applications with user info */
export async function fetchApplications(): Promise<AdminApplication[]> {
  const { data, error } = await supabase
    .from('author_applications')
    .select(`
      id, user_id, writing_sample, motivation, genre, social_links,
      sample_file_url, sample_file_name,
      status, admin_notes, reviewed_by, submitted_at, reviewed_at,
      users!author_applications_user_id_fkey ( full_name, username, email, avatar_url )
    `)
    .order('submitted_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((a: any): AdminApplication => ({
    id: a.id,
    userId: a.user_id,
    writingSample: a.writing_sample,
    motivation: a.motivation,
    genre: a.genre,
    socialLinks: a.social_links,
    sampleFileUrl: a.sample_file_url,
    sampleFileName: a.sample_file_name,
    status: a.status,
    adminNotes: a.admin_notes,
    reviewedBy: a.reviewed_by,
    submittedAt: a.submitted_at,
    reviewedAt: a.reviewed_at,
    userName: a.users?.full_name ?? a.users?.username ?? 'Unknown',
    userEmail: a.users?.email ?? '',
    userAvatar: a.users?.avatar_url,
  }));
}

/** Approve an application: update status → call RPC to set role + send notification */
export async function approveApplication(applicationId: string, userId: string) {
  // Update application status first
  const { error: appErr } = await supabase
    .from('author_applications')
    .update({
      status: 'APPROVED',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', applicationId);
  if (appErr) throw appErr;

  // Call SECURITY DEFINER function: upgrades role + creates author_profile + sends notification
  const { error: fnErr } = await supabase.rpc('create_author_approval_notification', {
    p_user_id: userId,
    p_status: 'APPROVED',
    p_admin_notes: null,
  });

  if (fnErr) {
    // Fallback: manually upgrade if RPC fails (e.g., notification insert permissions)
    console.warn('RPC failed, using fallback:', fnErr.message);
    await supabase
      .from('users')
      .update({ role: 'AUTHOR', updated_at: new Date().toISOString() })
      .eq('id', userId);
    await supabase
      .from('author_profiles')
      .upsert({ user_id: userId, total_books: 0, total_sales: 0 }, { onConflict: 'user_id' });
  }
}

/** Reject an application + send notification */
export async function rejectApplication(applicationId: string, adminNotes?: string) {
  // Get user_id
  const { data: app } = await supabase
    .from('author_applications')
    .select('user_id')
    .eq('id', applicationId)
    .single();

  const { error } = await supabase
    .from('author_applications')
    .update({
      status: 'REJECTED',
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes ?? null,
    })
    .eq('id', applicationId);
  if (error) throw error;

  // Send notification
  if (app?.user_id) {
    const { error: rpcErr } = await supabase.rpc('create_author_approval_notification', {
      p_user_id: app.user_id,
      p_status: 'REJECTED',
      p_admin_notes: adminNotes ?? null,
    });
    if (rpcErr) console.warn('Failed to send rejection notification:', rpcErr);
  }
}

/* ── Real-time Subscriptions ─────────────────────────────────────── */

/** Subscribe to new/updated applications (admin real-time) */
export function subscribeToApplicationChanges(onRefresh: () => void) {
  const channelId = `admin-apps-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'author_applications' },
      onRefresh
    )
    .subscribe();
}

/** Subscribe to user changes (role, active status) */
export function subscribeToUserChanges(onRefresh: () => void) {
  const channelId = `admin-users-feed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      onRefresh
    )
    .subscribe();
}

// Keep old name for backward compatibility
export const subscribeToAllApplications = subscribeToApplicationChanges;

// Admin accounts functions removed — admin_accounts table does not exist.
// Admins are managed via the users table with role = 'admin'.
