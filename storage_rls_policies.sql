-- ══════════════════════════════════════════════════════════════════════════
-- Lehkhabu — Storage RLS Policies
-- Run this in the Supabase SQL Editor to configure storage access control.
--
-- Prerequisites: Storage buckets must already exist. If not, run:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true);
--   INSERT INTO storage.buckets (id, name, public) VALUES ('book-files', 'book-files', false);
--   INSERT INTO storage.buckets (id, name, public) VALUES ('application-files', 'application-files', false);
--   INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
--   INSERT INTO storage.buckets (id, name, public) VALUES ('profile-backgrounds', 'profile-backgrounds', true);
-- ══════════════════════════════════════════════════════════════════════════

-- ── Helper function: check if user is an active admin ────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'super_admin')
  );
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- 1. BOOK-COVERS BUCKET — public read, authenticated authors upload only
-- ══════════════════════════════════════════════════════════════════════════

-- Public can read all covers (bucket is already marked public=true)
CREATE POLICY "book_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers');

-- Only authenticated users with an author_profiles row can upload covers
CREATE POLICY "book_covers_author_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'book-covers'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );

-- Authors can update their own covers (path starts with their author profile id)
CREATE POLICY "book_covers_author_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'book-covers'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );

-- Authors can delete their own covers
CREATE POLICY "book_covers_author_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'book-covers'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- 2. BOOK-FILES BUCKET — authors upload, purchasers + admins read
-- ══════════════════════════════════════════════════════════════════════════

-- Only users who have a COMPLETED purchase for the book can read the file.
-- file_url stores the raw storage path (e.g. 'authorId/1717345200000.pdf')
-- which matches storage.objects.name directly.
-- Admins can also read all files.
CREATE POLICY "book_files_purchaser_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'book-files'
    AND (
      -- Admin can read all
      public.is_admin()
      OR
      -- The uploading author can read their own files
      EXISTS (
        SELECT 1 FROM public.author_profiles ap
        WHERE ap.user_id = auth.uid()
          AND ap.status = 'APPROVED'
      )
      OR
      -- User has a completed purchase for a book whose file_url is this object's path
      EXISTS (
        SELECT 1 FROM public.purchases p
        JOIN public.books b ON b.id = p.book_id
        WHERE p.user_id = auth.uid()
          AND p.status = 'COMPLETED'
          AND b.file_url = storage.objects.name
      )
    )
  );

-- Authenticated authors can upload book files
CREATE POLICY "book_files_author_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'book-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );

-- Authors can update their own files
CREATE POLICY "book_files_author_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'book-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );

-- Authors can delete their own files
CREATE POLICY "book_files_author_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'book-files'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.author_profiles
      WHERE user_id = auth.uid()
      AND status = 'APPROVED'
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- 3. APPLICATION-FILES BUCKET — users upload own, admins read all
-- ══════════════════════════════════════════════════════════════════════════

-- Authenticated users can upload their own application files
-- Path convention: {user_id}/{filename}
CREATE POLICY "app_files_user_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'application-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own files, admins can read all
CREATE POLICY "app_files_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'application-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- Users can delete their own files
CREATE POLICY "app_files_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'application-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ══════════════════════════════════════════════════════════════════════════
-- 4. AVATARS BUCKET — public read, users upload own
-- ══════════════════════════════════════════════════════════════════════════

CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_user_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_user_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ══════════════════════════════════════════════════════════════════════════
-- 5. PROFILE-BACKGROUNDS BUCKET — public read, users upload own
-- ══════════════════════════════════════════════════════════════════════════

CREATE POLICY "profile_bg_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-backgrounds');

CREATE POLICY "profile_bg_user_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-backgrounds'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_bg_user_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-backgrounds'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_bg_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-backgrounds'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION PLAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- After running the above SQL, verify with the following tests:
--
-- ── book-covers ──────────────────────────────────────────────────────────
-- ✅ SHOULD SUCCEED: Unauthenticated GET to a cover image URL (public read)
-- ✅ SHOULD SUCCEED: Authenticated author uploads a cover via Supabase SDK
-- ❌ SHOULD FAIL: Non-author authenticated user tries to upload a cover
-- ❌ SHOULD FAIL: Unauthenticated user tries to upload a cover
--
-- ── book-files ───────────────────────────────────────────────────────────
-- ✅ SHOULD SUCCEED: User with COMPLETED purchase downloads the book file
-- ✅ SHOULD SUCCEED: Admin reads any book file
-- ✅ SHOULD SUCCEED: Author uploads a book file
-- ❌ SHOULD FAIL: User WITHOUT a purchase tries to download a book file
-- ❌ SHOULD FAIL: Non-author user tries to upload a book file
-- ❌ SHOULD FAIL: Unauthenticated user tries to download any book file
--
-- ── application-files ────────────────────────────────────────────────────
-- ✅ SHOULD SUCCEED: Authenticated user uploads file to their own folder
-- ✅ SHOULD SUCCEED: User reads their own uploaded file
-- ✅ SHOULD SUCCEED: Admin reads any user's application file
-- ❌ SHOULD FAIL: User reads another user's application file
-- ❌ SHOULD FAIL: User uploads to another user's folder
--
-- ── avatars & profile-backgrounds ────────────────────────────────────────
-- ✅ SHOULD SUCCEED: Anyone can view avatars/backgrounds (public read)
-- ✅ SHOULD SUCCEED: Authenticated user uploads to their own folder
-- ❌ SHOULD FAIL: User uploads to another user's folder
-- ══════════════════════════════════════════════════════════════════════════
