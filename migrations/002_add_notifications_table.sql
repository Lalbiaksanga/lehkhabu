-- ══════════════════════════════════════════════════════════════════════════
-- Migration 002: Add notifications table & fix author_applications columns
-- Run this in the Supabase SQL Editor.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS column check).
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Create notifications table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    type        VARCHAR(100) NOT NULL,
    title       VARCHAR(500) NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id) WHERE is_read = FALSE;

-- ── 2. RLS on notifications ─────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own notifications
DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
CREATE POLICY "notifications_own_read" ON public.notifications FOR SELECT
    USING (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- Admins and service_role can insert notifications for any user
DROP POLICY IF EXISTS "notifications_service_insert" ON public.notifications;
CREATE POLICY "notifications_service_insert" ON public.notifications FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (SELECT current_setting('role', true)) = 'service_role'
    );

-- ── 3. Add sample_file columns to author_applications ───────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'author_applications'
          AND column_name = 'sample_file_url'
    ) THEN
        ALTER TABLE public.author_applications
            ADD COLUMN sample_file_url TEXT,
            ADD COLUMN sample_file_name VARCHAR(500);
    END IF;
END
$$;

-- ── 4. Enable realtime on notifications ─────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ══════════════════════════════════════════════════════════════════════════
-- Verification
-- ══════════════════════════════════════════════════════════════════════════
-- After running, verify:
--   SELECT * FROM public.notifications LIMIT 1;           -- should return empty, no error
--   SELECT sample_file_url FROM public.author_applications LIMIT 1;  -- should work
-- ══════════════════════════════════════════════════════════════════════════
