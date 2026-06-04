import { supabase } from '../lib/supabase';

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  username: string;
}

export interface SignInData {
  email: string;
  password: string;
}

/** Sign up a new user — creates auth user + public.users row via DB trigger */
export async function signUp({ email, password, fullName, username }: SignUpData) {
  // First check if username is taken
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    throw new Error('Username is already taken. Please choose another.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        username,
      },
    },
  });

  if (error) throw error;
  return data;
}

/** Sign in with email + password */
export async function signIn({ email, password }: SignInData) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Prevent admins from logging in via the user app
  if (data.user) {
    const { data: adminRow } = await supabase
      .from('admin_accounts')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (adminRow) {
      await supabase.auth.signOut();
      throw new Error('Admin accounts cannot log in to the user application. Please use the Admin Portal.');
    }
  }

  return data;
}

/** Sign out current user */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Get current session */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Fetch the public.users profile for the current auth user */
export async function fetchUserProfile(supabaseUid: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('supabase_uid', supabaseUid)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Upsert public.users profile (called after sign-up if trigger hasn't run yet) */
export async function upsertUserProfile(supabaseUid: string, email: string, fullName: string, username: string) {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        supabase_uid: supabaseUid,
        email,
        full_name: fullName,
        username,
      },
      { onConflict: 'supabase_uid' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Send password reset email */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}
