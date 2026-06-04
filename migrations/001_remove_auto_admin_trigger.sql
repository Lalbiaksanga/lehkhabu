-- ══════════════════════════════════════════════════════════════════════════
-- Lehkhabu — Admin Trigger Security Fix
-- 
-- WHAT THIS FIXES:
--   The handle_new_auth_user() trigger currently auto-creates admin accounts
--   when a user signs up with an email matching 'supremeadmin@lehkhabu.com'
--   or 'editoradmin@lehkhabu.com'. This means if an attacker creates a
--   Supabase auth account with that email BEFORE the real admin does,
--   they get admin access.
--
-- WHAT THIS DOES:
--   Removes the auto-admin-creation block from the trigger.
--   Everything else the trigger does (user profile creation, username
--   generation, email verification sync) remains untouched.
--
-- SAFE TO RUN ON A LIVE DATABASE:
--   - Uses CREATE OR REPLACE (no DROP + CREATE gap)
--   - No data is deleted or modified
--   - Existing admin_accounts rows are unaffected
--   - The trigger binding does NOT need to be recreated
--
-- AFTER RUNNING THIS:
--   Admin accounts must be created manually via SQL by a super_admin:
--
--   INSERT INTO public.admin_accounts (id, email, full_name, role, is_active)
--   VALUES (
--     '<supabase_auth_user_id>',
--     'admin@example.com',
--     'Admin Name',
--     'super_admin',  -- or 'admin' or 'readonly_admin'
--     true
--   );
-- ══════════════════════════════════════════════════════════════════════════

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

    -- SECURITY FIX: Removed auto-admin-account creation.
    -- Admin accounts should ONLY be created manually by a super_admin via SQL.
    -- See migration header comments for the INSERT statement.

    RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION:
--   After running this migration, verify with:
--
--   1. Create a new auth user with email 'supremeadmin@lehkhabu.com':
--      - The users table should get a new row (user profile creation works)
--      - The admin_accounts table should NOT get a new row
--
--   2. Existing admin accounts are unaffected:
--      SELECT * FROM public.admin_accounts;
--      (should still show any previously created admins)
--
--   3. The trigger is still attached:
--      SELECT * FROM information_schema.triggers
--      WHERE trigger_name = 'on_auth_user_created';
--      (should return 1 row)
-- ══════════════════════════════════════════════════════════════════════════
