-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0005_rls_policies.sql
-- Description: Row Level Security policies for all tables
-- Applied: 2026-04-10 (Supabase migrations: 20260410103121 + 20260410113141)
-- ═══════════════════════════════════════════════════════════════════════
-- Depends on: 0001, 0002, 0003
--
-- RLS ensures users can only access their own data.
-- The anon key used by the frontend is safely restricted.

-- ── Helper function ──────────────────────────────────────────────────────
-- Resolves the internal public.users.id from the Supabase JWT uid.

CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM public.users WHERE supabase_uid = auth.uid()::TEXT LIMIT 1;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: users
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read public profiles
CREATE POLICY "users_select_public"
    ON public.users FOR SELECT
    USING (TRUE);

-- Users can only update their own profile
CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (supabase_uid = auth.uid()::TEXT);

-- Service role can insert (for the auth trigger)
CREATE POLICY "users_insert_trigger"
    ON public.users FOR INSERT
    WITH CHECK (TRUE);

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: author_profiles
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;

-- Public read — everyone can see author profiles
CREATE POLICY "author_profiles_select_public"
    ON public.author_profiles FOR SELECT
    USING (TRUE);

-- Authors manage their own profile
CREATE POLICY "author_profiles_manage_own"
    ON public.author_profiles FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: books
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Published books are visible to everyone
CREATE POLICY "books_select_published"
    ON public.books FOR SELECT
    USING (status = 'PUBLISHED');

-- Authors can see/manage their own books at any status
CREATE POLICY "books_author_manage_own"
    ON public.books FOR ALL
    USING (
        author_id IN (
            SELECT id FROM public.author_profiles
            WHERE user_id = public.get_my_user_id()
        )
    )
    WITH CHECK (
        author_id IN (
            SELECT id FROM public.author_profiles
            WHERE user_id = public.get_my_user_id()
        )
    );

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: purchases
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_own_only"
    ON public.purchases FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: reviews
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are public to read
CREATE POLICY "reviews_select_public"
    ON public.reviews FOR SELECT
    USING (TRUE);

-- Users manage their own reviews
CREATE POLICY "reviews_manage_own"
    ON public.reviews FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: shelf_entries
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.shelf_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shelf_entries_own_only"
    ON public.shelf_entries FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: reading_progress
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_progress_own_only"
    ON public.reading_progress FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: reading_challenges
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.reading_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_challenges_own_only"
    ON public.reading_challenges FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: author_applications
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.author_applications ENABLE ROW LEVEL SECURITY;

-- Applicant can see/manage their own submissions
CREATE POLICY "author_apps_own"
    ON public.author_applications FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- ════════════════════════════════════════════════════════════════════════
-- TABLE: announcements
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Active announcements are public
CREATE POLICY "announcements_select_active"
    ON public.announcements FOR SELECT
    USING (is_active = TRUE);
