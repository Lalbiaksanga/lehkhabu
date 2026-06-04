-- ═══════════════════════════════════════════════════════════════════════
-- Lehkhabu — Complete Consolidated Database Schema
-- Paste this script into the Supabase SQL Editor and click RUN.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enum Types ───────────────────────────────────────────────────────────
CREATE TYPE userrole AS ENUM ('USER', 'AUTHOR', 'ADMIN');
CREATE TYPE bookstatus AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE purchasestatus AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE shelftype AS ENUM ('WANT_TO_READ', 'READING', 'READ');
CREATE TYPE authorapplicationstatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ── public.users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    email            VARCHAR(255) NOT NULL UNIQUE,
    username         VARCHAR(50)  NOT NULL UNIQUE,
    full_name        VARCHAR(200) NOT NULL,
    hashed_password  TEXT,                           -- null if pure Supabase auth
    role             userrole    NOT NULL DEFAULT 'USER',
    avatar_url       TEXT,
    profile_bg_url   TEXT,                           -- user profile background image URL
    social_links     JSONB       DEFAULT '{}'::jsonb, -- social links object: { twitter, instagram, website }
    is_public_library BOOLEAN    NOT NULL DEFAULT TRUE, -- whether shelf is publicly visible
    bio              TEXT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    is_email_verified BOOLEAN    NOT NULL DEFAULT FALSE,
    following_count  INTEGER     NOT NULL DEFAULT 0,
    followers_count  INTEGER     NOT NULL DEFAULT 0,
    supabase_uid     VARCHAR(255) UNIQUE,            -- links to auth.users.id
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_username    ON public.users (username);
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users (supabase_uid);

-- ── public.author_profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.author_profiles (
    id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id      UUID NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
    pen_name     VARCHAR(200),
    website      TEXT,
    social_links TEXT,   -- JSON string: { twitter, instagram, ... }
    total_books  INTEGER NOT NULL DEFAULT 0,
    total_sales  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── public.books ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.books (
    id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    author_id            UUID NOT NULL REFERENCES public.author_profiles (id) ON DELETE CASCADE,
    title                VARCHAR(500) NOT NULL,
    slug                 VARCHAR(600) NOT NULL UNIQUE,
    description          TEXT,
    isbn                 VARCHAR(20) UNIQUE,
    language             VARCHAR(10)  NOT NULL DEFAULT 'en',
    category             VARCHAR(100) NOT NULL,
    tags                 TEXT[]       NOT NULL DEFAULT '{}',
    cover_image_url      TEXT,
    file_url             TEXT,        -- epub / pdf storage path
    cover_color_primary  VARCHAR(7),  -- hex colour e.g. #C17817
    cover_color_secondary VARCHAR(7),
    price                FLOAT        NOT NULL DEFAULT 0.0,
    is_free              BOOLEAN      NOT NULL DEFAULT FALSE,
    total_pages          INTEGER,
    word_count           INTEGER,
    average_rating       FLOAT        NOT NULL DEFAULT 0.0,
    rating_count         INTEGER      NOT NULL DEFAULT 0,
    purchase_count       INTEGER      NOT NULL DEFAULT 0,
    status               VARCHAR(50)  NOT NULL DEFAULT 'DRAFT',
    submitted_at         TIMESTAMPTZ,
    published_at         TIMESTAMPTZ,
    admin_notes          TEXT,
    preview_pages        INTEGER      DEFAULT 0,
    view_count           INTEGER      DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_slug     ON public.books (slug);
CREATE INDEX IF NOT EXISTS idx_books_category ON public.books (category);
CREATE INDEX IF NOT EXISTS idx_books_status   ON public.books (status);
CREATE INDEX IF NOT EXISTS idx_books_author   ON public.books (author_id);

-- ── public.purchases ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchases (
    id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id              UUID REFERENCES public.books (id) ON DELETE SET NULL,
    amount               FLOAT        DEFAULT 0.0,
    currency             VARCHAR(3)   NOT NULL DEFAULT 'INR',
    status               purchasestatus NOT NULL DEFAULT 'PENDING',
    razorpay_order_id    VARCHAR(200),
    razorpay_payment_id  VARCHAR(200) UNIQUE,
    amount_paid          FLOAT        DEFAULT 0.0,
    is_free              BOOLEAN      DEFAULT FALSE,
    payment_ref          TEXT,
    purchased_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user   ON public.purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_book   ON public.purchases (book_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases (status);

-- ── public.reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
    id         UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id    UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_book ON public.reviews (book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews (user_id);

-- ── public.shelf_entries ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shelf_entries (
    id       UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id  UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id  UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    shelf    shelftype NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_user  ON public.shelf_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_shelf_book  ON public.shelf_entries (book_id);
CREATE INDEX IF NOT EXISTS idx_shelf_shelf ON public.shelf_entries (shelf);

-- ── public.reading_progress ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reading_progress (
    id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id      UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    current_page INTEGER NOT NULL DEFAULT 0,
    percentage   FLOAT   NOT NULL DEFAULT 0.0,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON public.reading_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_progress_book ON public.reading_progress (book_id);

-- ── public.reading_challenges ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reading_challenges (
    id        UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id   UUID    NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    year      INTEGER NOT NULL,
    goal      INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_challenges_user ON public.reading_challenges (user_id);

-- ── public.author_applications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.author_applications (
    id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    writing_sample  TEXT NOT NULL,
    motivation      TEXT NOT NULL,
    genre           VARCHAR(100) NOT NULL,
    social_links    TEXT,               -- JSON string
    sample_file_url TEXT,
    sample_file_name VARCHAR(500),
    status          authorapplicationstatus NOT NULL DEFAULT 'PENDING',
    admin_notes     TEXT,
    reviewed_by     UUID REFERENCES public.users (id) ON DELETE SET NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apps_user   ON public.author_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.author_applications (status);

-- ── public.announcements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
    id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    title       VARCHAR(500) NOT NULL,
    content     TEXT         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES public.users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements (is_active);

-- ── public.notifications ─────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE is_read = FALSE;

-- ── public.admin_accounts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Helper function: get_my_user_id ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM public.users WHERE supabase_uid = auth.uid()::TEXT LIMIT 1;
$$;

-- ── Helper function: record_admin_login ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_admin_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.admin_accounts 
  SET last_login_at = now()
  WHERE id = auth.uid();
END;
$$;

-- ── Trigger function: handle_new_auth_user ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _username TEXT;
    _full_name TEXT;
BEGIN
    -- Derive username from metadata, or fall back to email prefix
    _username  := COALESCE(
                    NEW.raw_user_meta_data->>'username',
                    SPLIT_PART(NEW.email, '@', 1)
                  );
    _full_name := COALESCE(
                    NEW.raw_user_meta_data->>'full_name',
                    _username
                  );

    -- Make username unique by appending a random suffix if it already exists
    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = _username) LOOP
        _username := _username || '_' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4);
    END LOOP;

    INSERT INTO public.users (
        supabase_uid,
        email,
        username,
        full_name,
        role,
        is_active,
        is_email_verified
    ) VALUES (
        NEW.id::TEXT,
        NEW.email,
        _username,
        _full_name,
        'USER',
        TRUE,
        NEW.email_confirmed_at IS NOT NULL
    )
    ON CONFLICT (supabase_uid) DO UPDATE
        SET email              = EXCLUDED.email,
            is_email_verified  = NEW.email_confirmed_at IS NOT NULL,
            updated_at         = NOW();

    -- SECURITY: Admin accounts must be created manually via SQL.
    -- Do NOT auto-create admin accounts based on email matching.

    RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (fires after every INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- ── Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelf_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;

-- Helper function: is_admin ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts
    WHERE id = auth.uid() AND is_active = TRUE
  );
$$;

-- users policies
DROP POLICY IF EXISTS "users_select_public" ON public.users;
CREATE POLICY "users_select_public" ON public.users FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (supabase_uid = auth.uid()::TEXT);

DROP POLICY IF EXISTS "users_insert_trigger" ON public.users;
CREATE POLICY "users_insert_trigger" ON public.users FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "users_admin_all" ON public.users;
CREATE POLICY "users_admin_all" ON public.users FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- author_profiles policies
DROP POLICY IF EXISTS "author_profiles_select_public" ON public.author_profiles;
CREATE POLICY "author_profiles_select_public" ON public.author_profiles FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "author_profiles_manage_own" ON public.author_profiles;
CREATE POLICY "author_profiles_manage_own" ON public.author_profiles FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "author_profiles_admin_all" ON public.author_profiles;
CREATE POLICY "author_profiles_admin_all" ON public.author_profiles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- books policies
DROP POLICY IF EXISTS "books_select_published" ON public.books;
CREATE POLICY "books_select_published" ON public.books FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS "books_author_manage_own" ON public.books;
CREATE POLICY "books_author_manage_own" ON public.books FOR ALL
    USING (author_id IN (SELECT id FROM public.author_profiles WHERE user_id = public.get_my_user_id()))
    WITH CHECK (author_id IN (SELECT id FROM public.author_profiles WHERE user_id = public.get_my_user_id()));

DROP POLICY IF EXISTS "books_admin_all" ON public.books;
CREATE POLICY "books_admin_all" ON public.books FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- purchases policies
DROP POLICY IF EXISTS "purchases_own_only" ON public.purchases;
CREATE POLICY "purchases_own_only" ON public.purchases FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "purchases_admin_all" ON public.purchases;
CREATE POLICY "purchases_admin_all" ON public.purchases FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- reviews policies
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "reviews_manage_own" ON public.reviews;
CREATE POLICY "reviews_manage_own" ON public.reviews FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- shelf_entries policies
DROP POLICY IF EXISTS "shelf_entries_own_only" ON public.shelf_entries;
CREATE POLICY "shelf_entries_own_only" ON public.shelf_entries FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- reading_progress policies
DROP POLICY IF EXISTS "reading_progress_own_only" ON public.reading_progress;
CREATE POLICY "reading_progress_own_only" ON public.reading_progress FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- reading_challenges policies
DROP POLICY IF EXISTS "reading_challenges_own_only" ON public.reading_challenges;
CREATE POLICY "reading_challenges_own_only" ON public.reading_challenges FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

-- author_applications policies
DROP POLICY IF EXISTS "author_apps_own" ON public.author_applications;
CREATE POLICY "author_apps_own" ON public.author_applications FOR ALL
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "author_apps_admin_all" ON public.author_applications;
CREATE POLICY "author_apps_admin_all" ON public.author_applications FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- announcements policies
DROP POLICY IF EXISTS "announcements_select_active" ON public.announcements;
CREATE POLICY "announcements_select_active" ON public.announcements FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- notifications policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
CREATE POLICY "notifications_own_read" ON public.notifications FOR SELECT
    USING (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE
    USING (user_id = public.get_my_user_id())
    WITH CHECK (user_id = public.get_my_user_id());

DROP POLICY IF EXISTS "notifications_service_insert" ON public.notifications;
CREATE POLICY "notifications_service_insert" ON public.notifications FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (SELECT current_setting('role', true)) = 'service_role'
    );

-- admin_accounts policies
DROP POLICY IF EXISTS "Admin accounts are viewable by authenticated users" ON public.admin_accounts;
CREATE POLICY "Admin accounts are viewable by authenticated users"
  ON public.admin_accounts FOR SELECT USING (auth.role() = 'authenticated');
  
DROP POLICY IF EXISTS "Super admins can update" ON public.admin_accounts;
CREATE POLICY "Super admins can update"
  ON public.admin_accounts FOR UPDATE USING (
    (SELECT role FROM public.admin_accounts WHERE id = auth.uid()) = 'super_admin'
  );

-- ── Seed Demo Data (Author and Sample Books) ─────────────────────────────
INSERT INTO public.users (
    id, email, username, full_name, role, is_active, is_email_verified
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo.author@lehkhabu.com',
    'lalhruaitea',
    'Lalhruaitea Pachuau',
    'AUTHOR',
    TRUE,
    TRUE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.author_profiles (
    id, user_id, pen_name, total_books
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'L. Pachuau',
    8
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.books (
    id, author_id, title, slug, description, category, language,
    is_free, price, status, published_at,
    cover_color_primary, cover_color_secondary,
    average_rating, rating_count, total_pages
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Khawngaihthlak Thlipui',
    'khawngaihthlak-thlipui',
    'A heartfelt novel about love, loss, and longing in the Mizo highlands.',
    'Fiction',
    'mizo',
    TRUE, 0,
    'PUBLISHED', NOW(),
    '#7C3AED', '#A78BFA',
    4.7, 234, 312
),
(
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Zovawk Thar',
    'zovawk-thar',
    'An inspiring coming-of-age story set in modern Aizawl.',
    'Fiction',
    'mizo',
    TRUE, 0,
    'PUBLISHED', NOW(),
    '#1D4ED8', '#60A5FA',
    4.5, 189, 278
),
(
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Mizo Chanchin Lehkhabu',
    'mizo-chanchin-lehkhabu',
    'A comprehensive guide to Mizo history and culture.',
    'History',
    'mizo',
    FALSE, 150,
    'PUBLISHED', NOW(),
    '#065F46', '#34D399',
    4.9, 567, 450
),
(
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000002',
    'Tlang-a Mit Chhung',
    'tlang-a-mit-chhung',
    'Poetry celebrating the hills, clouds, and rivers of Mizoram.',
    'Poetry',
    'mizo',
    TRUE, 0,
    'PUBLISHED', NOW(),
    '#B45309', '#FBBF24',
    4.6, 123, 180
),
(
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000002',
    'Hnam Thar Lamzin',
    'hnam-thar-lamzin',
    'A spiritual and cultural exploration of Mizo identity in the 21st century.',
    'Non-fiction',
    'mizo',
    FALSE, 200,
    'PUBLISHED', NOW(),
    '#991B1B', '#F87171',
    4.4, 98, 320
),
(
    '10000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000002',
    'Thlanmuan Khua',
    'thlanmuan-khua',
    'A mystery thriller set in a remote Mizo village.',
    'Thriller',
    'mizo',
    FALSE, 120,
    'PUBLISHED', NOW(),
    '#1E1B4B', '#818CF8',
    4.8, 312, 398
),
(
    '10000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000002',
    'Lehkha Tha Ziak Dan',
    'lehkha-tha-ziak-dan',
    'A guide to creative writing in the Mizo language.',
    'Education',
    'mizo',
    TRUE, 0,
    'PUBLISHED', NOW(),
    '#065F46', '#6EE7B7',
    4.3, 67, 245
),
(
    '10000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000002',
    'Lal Isua Tangkawng',
    'lal-isua-tangkawng',
    'A devotional collection of Mizo Christian poetry and prose.',
    'Spiritual',
    'mizo',
    TRUE, 0,
    'PUBLISHED', NOW(),
    '#831843', '#F9A8D4',
    4.9, 445, 290
)
ON CONFLICT (id) DO NOTHING;
