/**
 * Unified book display type.
 * Accepts both the legacy mock-data Book and the new Supabase Book format.
 * All fields are optional except id and title, so both forms work.
 */
export interface DisplayBook {
  id: string;
  title: string;
  // Legacy fields (mock data)
  author?: string;
  rating?: number;
  ratingCount?: number;
  coverImage?: string;
  coverColors?: [string, string];
  coverTextColor?: string;
  price?: number;
  purchased?: boolean;
  // Supabase fields
  author_name?: string;
  average_rating?: number;
  rating_count?: number;
  cover_image_url?: string | null;
  cover_color_primary?: string | null;
  cover_color_secondary?: string | null;
  is_free?: boolean;
}
