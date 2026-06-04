-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0003_challenges_and_applications.sql
-- Description: Reading challenges, author applications, announcements
-- Applied: 2026-04-10 (part of Supabase migration: 20260410011353)
-- ═══════════════════════════════════════════════════════════════════════
-- Depends on: 0001_initial_schema.sql

-- ── Enum Types ───────────────────────────────────────────────────────────

CREATE TYPE authorapplicationstatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ── reading_challenges ────────────────────────────────────────────────────
-- Annual reading goals set by users.

CREATE TABLE public.reading_challenges (
    id        UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id   UUID    NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    year      INTEGER NOT NULL,
    goal      INTEGER NOT NULL,         -- target books for the year
    completed INTEGER NOT NULL DEFAULT 0,

    UNIQUE (user_id, year)              -- one challenge per user per year
);

CREATE INDEX idx_challenges_user ON public.reading_challenges (user_id);

-- ── author_applications ───────────────────────────────────────────────────
-- Author role requests submitted by users, reviewed by admins.

CREATE TABLE public.author_applications (
    id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    writing_sample  TEXT NOT NULL,
    motivation      TEXT NOT NULL,
    genre           VARCHAR(100) NOT NULL,
    social_links    TEXT,               -- JSON string
    status          authorapplicationstatus NOT NULL DEFAULT 'PENDING',
    admin_notes     TEXT,
    reviewed_by     UUID REFERENCES public.users (id) ON DELETE SET NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX idx_apps_user   ON public.author_applications (user_id);
CREATE INDEX idx_apps_status ON public.author_applications (status);

-- ── announcements ────────────────────────────────────────────────────────
-- Platform-wide announcements published by admins.

CREATE TABLE public.announcements (
    id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    title       VARCHAR(500) NOT NULL,
    content     TEXT         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES public.users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_announcements_active ON public.announcements (is_active);
