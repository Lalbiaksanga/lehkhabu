const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const env = fs.readFileSync(envPath, 'utf-8');
  const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim().replace('postgresql+asyncpg', 'postgres');
  
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  const sql = `
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

    ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Admin accounts are viewable by authenticated users" ON public.admin_accounts;
    CREATE POLICY "Admin accounts are viewable by authenticated users"
      ON public.admin_accounts FOR SELECT USING (auth.role() = 'authenticated');
      
    DROP POLICY IF EXISTS "Super admins can update" ON public.admin_accounts;
    CREATE POLICY "Super admins can update"
      ON public.admin_accounts FOR UPDATE USING (
        (SELECT role FROM public.admin_accounts WHERE id = auth.uid()) = 'super_admin'
      );

    -- Helper function for admin login tracking
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
    
    -- Allow the public.users constraint to accept all roles
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role = ANY (ARRAY['passenger', 'driver', 'checker', 'operator', 'super_admin', 'admin', 'user', 'author']));
    
    -- Cleanup bad public.users rows
    DELETE FROM public.users WHERE email LIKE '%admin%';
  `;
  
  await client.query(sql);
  
  // Also recreate the trigger but we have to do it carefully
  const triggerSql = `
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public
    AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM public.admin_accounts WHERE email = NEW.email) THEN
        RETURN NEW;
      END IF;

      INSERT INTO public.users (id, email, full_name, role, is_active)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
        true
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
  `;
  await client.query(triggerSql);

  // Now, we know we have the users from the auth SDK:
  // supremeadmin@lehkhabu.com
  // editoradmin@lehkhabu.com
  // Let's insert them into admin_accounts
  const insertAdminsSql = `
    INSERT INTO public.admin_accounts (id, email, full_name, role, is_active)
    SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'role', true
    FROM auth.users
    WHERE email IN ('supremeadmin@lehkhabu.com', 'editoradmin@lehkhabu.com')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
  `;
  await client.query(insertAdminsSql);
  
  console.log('Successfully set up tables, policies, and users on the CORRECT database.');
  
  await client.end();
}
main();
