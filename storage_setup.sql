-- ═══════════════════════════════════════════════════════════════════════
-- Lehkhabu — Storage Buckets Setup
-- Paste this script into your Supabase SQL Editor and click RUN.
-- ═══════════════════════════════════════════════════════════════════════

-- Creates public/private buckets if they don't exist and configures limits
-- (Runs successfully under standard postgres role)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('book-covers', 'book-covers', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('book-files', 'book-files', false, 104857600, ARRAY['application/pdf', 'application/epub+zip', 'application/octet-stream']),
  ('application-files', 'application-files', false, 52428800, ARRAY['application/pdf', 'application/epub+zip', 'application/octet-stream', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('features-bg', 'features-bg', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE 
SET public = EXCLUDED.public, 
    file_size_limit = EXCLUDED.file_size_limit, 
    allowed_mime_types = EXCLUDED.allowed_mime_types;
