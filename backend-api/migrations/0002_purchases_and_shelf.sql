-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0002_purchases_and_shelf.sql
-- Description: Purchases, reviews, shelf entries, reading progress
-- Applied: 2026-04-10 (part of Supabase migration: 20260410011353)
-- ═══════════════════════════════════════════════════════════════════════
-- Depends on: 0001_initial_schema.sql

-- ── Enum Types ───────────────────────────────────────────────────────────

CREATE TYPE purchasestatus AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE shelftype AS ENUM ('WANT_TO_READ', 'READING', 'READ');

-- ── purchases ────────────────────────────────────────────────────────────
-- Records book purchase transactions (supports Razorpay).

CREATE TABLE public.purchases (
    id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id              UUID REFERENCES public.books (id) ON DELETE SET NULL,
    amount               FLOAT        NOT NULL,
    currency             VARCHAR(3)   NOT NULL DEFAULT 'INR',
    status               purchasestatus NOT NULL DEFAULT 'PENDING',
    razorpay_order_id    VARCHAR(200),
    razorpay_payment_id  VARCHAR(200) UNIQUE,
    purchased_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_user   ON public.purchases (user_id);
CREATE INDEX idx_purchases_book   ON public.purchases (book_id);
CREATE INDEX idx_purchases_status ON public.purchases (status);

-- ── reviews ──────────────────────────────────────────────────────────────
-- User book reviews and ratings (1-5).

CREATE TABLE public.reviews (
    id         UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id    UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, book_id)   -- one review per user per book
);

CREATE INDEX idx_reviews_book ON public.reviews (book_id);
CREATE INDEX idx_reviews_user ON public.reviews (user_id);

-- ── shelf_entries ─────────────────────────────────────────────────────────
-- Tracks which shelf a book is on for a given user.

CREATE TABLE public.shelf_entries (
    id       UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id  UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id  UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    shelf    shelftype NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, book_id)   -- one shelf slot per book per user
);

CREATE INDEX idx_shelf_user  ON public.shelf_entries (user_id);
CREATE INDEX idx_shelf_book  ON public.shelf_entries (book_id);
CREATE INDEX idx_shelf_shelf ON public.shelf_entries (shelf);

-- ── reading_progress ─────────────────────────────────────────────────────
-- Per-book reading position (page + percentage).

CREATE TABLE public.reading_progress (
    id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    book_id      UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
    current_page INTEGER NOT NULL DEFAULT 0,
    percentage   FLOAT   NOT NULL DEFAULT 0.0,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, book_id)
);

CREATE INDEX idx_progress_user ON public.reading_progress (user_id);
CREATE INDEX idx_progress_book ON public.reading_progress (book_id);
