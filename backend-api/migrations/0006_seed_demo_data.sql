-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0006_seed_demo_data.sql
-- Description: Demo author and 8 sample books (DEV / STAGING only)
-- Applied: 2026-04-10 (Supabase migration: 20260410113827)
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  DO NOT run this on production. It is for local/staging development only.
-- Depends on: 0001, 0002, 0003

-- ── Demo author user ─────────────────────────────────────────────────────
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

-- ── Demo author profile ───────────────────────────────────────────────────
INSERT INTO public.author_profiles (
    id, user_id, pen_name, total_books
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'L. Pachuau',
    8
) ON CONFLICT (id) DO NOTHING;

-- ── Demo books ────────────────────────────────────────────────────────────
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
