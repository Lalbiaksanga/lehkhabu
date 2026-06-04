import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchUserProfile, upsertUserProfile } from '../services/auth.service';

export interface AppUserProfile {
  id: string;
  email: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  profile_bg_url: string | null;
  bio: string | null;
  role: 'USER' | 'AUTHOR' | 'ADMIN';
  is_active: boolean;
  is_email_verified: boolean;
  following_count: number;
  followers_count: number;
  supabase_uid: string;
  created_at: string;
  updated_at: string;
  social_links: Record<string, string> | null;
  is_public_library: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: AppUserProfile | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setSession: (session: Session | null) => void;
  loadProfile: (uid: string) => Promise<void>;
  clearAuth: () => void;
}

// Store the listener unsubscribe handle outside the store to avoid state overhead
let _authListenerUnsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    // Prevent duplicate initialization
    if (get().initialized) return;
    set({ loading: true });

    // Get current session
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // Prevent admins from accessing the user app
      const { data: adminRow } = await supabase.from('admin_accounts').select('id').eq('id', session.user.id).maybeSingle();
      if (adminRow) {
        await supabase.auth.signOut();
        set({ loading: false, initialized: true });
        return;
      }
      set({ session, user: session.user });
      await get().loadProfile(session.user.id);
    }

    // Clean up any existing listener before registering a new one
    _authListenerUnsubscribe?.();

    // Listen for auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (newSession?.user) {
        const { data: adminRow } = await supabase.from('admin_accounts').select('id').eq('id', newSession.user.id).maybeSingle();
        if (adminRow) {
          await supabase.auth.signOut();
          set({ session: null, user: null, profile: null });
          return;
        }
        set({ session: newSession, user: newSession.user });
        await get().loadProfile(newSession.user.id);
      } else {
        set({ session: null, user: null, profile: null });
      }
    });

    _authListenerUnsubscribe = () => subscription.unsubscribe();

    set({ loading: false, initialized: true });
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  loadProfile: async (uid: string) => {
    try {
      let profile = await fetchUserProfile(uid);

      // If no profile exists yet (e.g. DB trigger hasn't created it), create it
      if (!profile) {
        const user = get().user;
        if (user) {
          const meta = user.user_metadata as { full_name?: string; username?: string } | null;
          profile = await upsertUserProfile(
            uid,
            user.email ?? '',
            meta?.full_name ?? '',
            meta?.username ?? `user_${uid.slice(0, 8)}`
          );
        }
      }

      set({ profile: profile as AppUserProfile | null });

      // Load user-specific book data (shelf, purchases) after profile is set
      if (profile?.id) {
        const { useBooksStore } = await import('./booksStore');
        useBooksStore.getState().loadUserData(profile.id);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  },

  clearAuth: () => {
    // Unsubscribe auth listener when clearing auth state
    _authListenerUnsubscribe?.();
    _authListenerUnsubscribe = null;
    set({ session: null, user: null, profile: null, initialized: false });
  },
}));
