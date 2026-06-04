-- ═══════════════════════════════════════════════════════════════════════
-- Migration: 0004_auth_trigger.sql
-- Description: Supabase auth → public.users auto-sync trigger
-- Applied: 2026-04-10 (Supabase migration: 20260410103111)
-- ═══════════════════════════════════════════════════════════════════════
-- Depends on: 0001_initial_schema.sql
--
-- When a user signs up via Supabase Auth, this trigger automatically
-- creates a matching row in public.users so the app always has a profile.

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

    RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (fires after every INSERT)
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();
