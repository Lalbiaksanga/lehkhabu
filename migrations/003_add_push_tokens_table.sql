-- ============================================================
-- Migration 003: Add user_push_tokens table
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/insert/delete their own tokens
CREATE POLICY "push_tokens_own_access" ON user_push_tokens
  FOR ALL
  USING (user_id = get_my_user_id())
  WITH CHECK (user_id = get_my_user_id());

-- Service role (Edge Functions) can read all tokens to send notifications
CREATE POLICY "push_tokens_service_role_read" ON user_push_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');
