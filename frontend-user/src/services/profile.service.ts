import { supabase } from '../lib/supabase';
import type { AppUserProfile } from '../store/authStore';

// ── Image Compression ────────────────────────────────────────────
/** Compress an image file on the client using Canvas before upload */
export async function compressImage(file: File, maxWidth = 400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Image compression failed'));
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}

// ── Avatar Upload ────────────────────────────────────────────────
/**
 * Upload (and compress) a profile avatar to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (JPEG, PNG, or WebP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be smaller than 10MB.');
  }

  // Compress before upload
  const compressed = await compressImage(file);

  const ext = 'webp';
  const filePath = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, compressed, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Get public URL
  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  // Bust cache with timestamp
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function uploadProfileBackground(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (JPEG, PNG, or WebP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be smaller than 10MB.');
  }

  // Compress to standard HD width max
  const compressed = await compressImage(file, 1920);
  const ext = 'webp';
  const filePath = `${userId}/background.${ext}`;

  const { error } = await supabase.storage
    .from('avatars') // Or create 'profile-backgrounds' bucket? Let's just use avatars bucket for all user media
    .upload(filePath, compressed, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

// ── Profile Updates ──────────────────────────────────────────────
export interface ProfileUpdateData {
  full_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
  profile_bg_url?: string | null;
  social_links?: Record<string, string> | null;
  is_public_library?: boolean;
}

export async function updateUserProfile(
  userId: string,
  updates: ProfileUpdateData
): Promise<AppUserProfile> {
  // Check username uniqueness if updating
  if (updates.username) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', updates.username)
      .neq('id', userId)
      .maybeSingle();

    if (existing) {
      throw new Error('Username is already taken. Please choose another.');
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as AppUserProfile;
}

// ── App Settings ─────────────────────────────────────────────────
export interface AppSettings {
  features_bg_image_url: string | null;
  features_bg_overlay_opacity: number;
  home_hero_text: string;
  home_sub_text: string;
}

const SETTINGS_CACHE_KEY = 'lehkhabu_app_settings';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchAppSettings(): Promise<AppSettings> {
  // Try memory/session cache first
  const cached = sessionStorage.getItem(SETTINGS_CACHE_KEY);
  if (cached) {
    try {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    } catch {
      // ignore parse errors
    }
  }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value');

  if (error) throw new Error(error.message);

  const map: Record<string, string | null> = {};
  (data ?? []).forEach((row: { key: string; value: string | null }) => {
    map[row.key] = row.value;
  });

  const settings: AppSettings = {
    features_bg_image_url: map.features_bg_image_url ?? null,
    features_bg_overlay_opacity: parseFloat(map.features_bg_overlay_opacity ?? '0.55'),
    home_hero_text: map.home_hero_text ?? 'Your Mizo Reading Universe',
    home_sub_text: map.home_sub_text ?? 'Discover books written by your favourite Mizo authors.',
  };

  sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ data: settings, ts: Date.now() }));
  return settings;
}

export function invalidateSettingsCache() {
  sessionStorage.removeItem(SETTINGS_CACHE_KEY);
}

// ── Admin: Features BG Upload ─────────────────────────────────────
export async function uploadFeaturesBg(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  const filePath = `features-bg/hero.webp`;
  const compressed = await compressImage(file, 1920, 0.85);

  const { error } = await supabase.storage
    .from('features-bg')
    .upload(filePath, compressed, { contentType: 'image/webp', upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from('features-bg').getPublicUrl(filePath);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  // Save to app_settings
  const { error: settingsErr } = await supabase
    .from('app_settings')
    .upsert({ key: 'features_bg_image_url', value: publicUrl });

  if (settingsErr) throw new Error(settingsErr.message);

  invalidateSettingsCache();
  return publicUrl;
}

export async function updateAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
  invalidateSettingsCache();
}
