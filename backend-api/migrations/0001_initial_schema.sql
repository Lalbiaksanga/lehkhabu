-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0001_initial_schema.sql
-- Description: Core tables — users, author_profiles, books
-- Applied: 2026-04-10 (Supabase migration: 20260410011353)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enum Types ───────────────────────────────────────────────────────────

CREATE TYPE userrole AS ENUM ('USER', 'AUTHOR', 'ADMIN');
CREATE TYPE bookstatus AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- ── users ────────────────────────────────────────────────────────────────
-- Central user table. Works alongside Supabase auth.users.
-- supabase_uid links to auth.users.id for session verification.

CREATE TABLE public.users (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    email            VARCHAR(255) NOT NULL UNIQUE,
    username         VARCHAR(50)  NOT NULL UNIQUE,
    full_name        VARCHAR(200) NOT NULL,
    hashed_password  TEXT,                           -- null if pure Supabase auth
    role             userrole    NOT NULL DEFAULT 'USER',
    avatar_url       TEXT,
    bio              TEXT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    is_email_verified BOOLEAN    NOT NULL DEFAULT FALSE,
    following_count  INTEGER     NOT NULL DEFAULT 0,
    followers_count  INTEGER     NOT NULL DEFAULT 0,
    supabase_uid     VARCHAR(255) UNIQUE,            -- links to auth.users.id
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email       ON public.users (email);
CREATE INDEX idx_users_username    ON public.users (username);
CREATE INDEX idx_users_supabase_uid ON public.users (supabase_uid);

-- ── author_profiles ──────────────────────────────────────────────────────
-- One-to-one extension of users for authors.

CREATE TABLE public.author_profiles (
    id           UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id      UUID NOT NULL UNIQUE REFERENCES public.users (id) ON DELETE CASCADE,
    pen_name     VARCHAR(200),
    website      TEXT,
    social_links TEXT,   -- JSON string: { twitter, instagram, ... }
    total_books  INTEGER NOT NULL DEFAULT 0,
    total_sales  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── books ────────────────────────────────────────────────────────────────

CREATE TABLE public.books (
    id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    author_id            UUID NOT NULL REFERENCES public.author_profiles (id) ON DELETE CASCADE,

    -- Core metadata
    title                VARCHAR(500) NOT NULL,
    slug                 VARCHAR(600) NOT NULL UNIQUE,
    description          TEXT,
    isbn                 VARCHAR(20) UNIQUE,
    language             VARCHAR(10)  NOT NULL DEFAULT 'en',

    -- Discovery
    category             VARCHAR(100) NOT NULL,
    tags                 TEXT[]       NOT NULL DEFAULT '{}',

    -- Files (Supabase Storage paths)
    cover_image_url      TEXT,
    file_url             TEXT,        -- epub / pdf storage path
    cover_color_primary  VARCHAR(7),  -- hex colour e.g. #C17817
    cover_color_secondary VARCHAR(7),

    -- Pricing
    price                FLOAT        NOT NULL DEFAULT 0.0,
    is_free              BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Content info
    total_pages          INTEGER,
    word_count           INTEGER,

    -- Aggregated stats (denormalised)
    average_rating       FLOAT        NOT NULL DEFAULT 0.0,
    rating_count         INTEGER      NOT NULL DEFAULT 0,
    purchase_count       INTEGER      NOT NULL DEFAULT 0,

    status               bookstatus   NOT NULL DEFAULT 'DRAFT',
    published_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_books_slug     ON public.books (slug);
CREATE INDEX idx_books_category ON public.books (category);
CREATE INDEX idx_books_status   ON public.books (status);
CREATE INDEX idx_books_author   ON public.books (author_id);
