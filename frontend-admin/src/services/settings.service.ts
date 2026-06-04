import { supabase } from '../lib/supabase';

export interface AppSettings {
  home_hero_text: string;
  home_sub_text: string;
  features_bg_image_url: string | null;
  features_bg_overlay_opacity: string;
  maintenance_mode: string;
  allow_registrations: string;
  platform_fee_percent: string;
  featured_section_title: string;
  new_books_highlight: string;
  announcement_banner_active: string;
  announcement_banner_text: string;
  max_books_per_user: string;
  default_currency: string;
  platform_name: string;
}

/** Get all app settings as a flat key-value object */
export async function fetchSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error) throw error;
  const obj: Record<string, string> = {};
  (data ?? []).forEach((row: any) => { obj[row.key] = row.value ?? ''; });
  return obj;
}

/** Alias for UISettingsPage compatibility */
export async function fetchAppSettings(): Promise<AppSettings> {
  const raw = await fetchSettings();
  return {
    home_hero_text: raw['home_hero_text'] ?? 'Your Mizo Reading Universe',
    home_sub_text: raw['home_sub_text'] ?? 'Discover books written by your favourite Mizo authors.',
    features_bg_image_url: raw['features_bg_image_url'] ?? null,
    features_bg_overlay_opacity: raw['features_bg_overlay_opacity'] ?? '0.55',
    maintenance_mode: raw['maintenance_mode'] ?? 'false',
    allow_registrations: raw['allow_registrations'] ?? 'true',
    platform_fee_percent: raw['platform_fee_percent'] ?? '15',
    featured_section_title: raw['featured_section_title'] ?? 'Featured Picks',
    new_books_highlight: raw['new_books_highlight'] ?? 'true',
    announcement_banner_active: raw['announcement_banner_active'] ?? 'false',
    announcement_banner_text: raw['announcement_banner_text'] ?? '',
    max_books_per_user: raw['max_books_per_user'] ?? '50',
    default_currency: raw['default_currency'] ?? 'INR',
    platform_name: raw['platform_name'] ?? 'Lehkhabu',
  };
}

/** Update a single setting */
export async function updateSetting(key: string, value: string) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

/** Update multiple settings at once */
export async function updateSettings(settings: Record<string, string>) {
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}

/** Upload a features background image to Supabase Storage */
export async function uploadFeaturesBg(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `features-bg/main.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('book-covers')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('book-covers').getPublicUrl(path);
  const publicUrl = data.publicUrl + `?t=${Date.now()}`;

  // Save the URL to app_settings
  await updateSetting('features_bg_image_url', publicUrl);

  return publicUrl;
}
