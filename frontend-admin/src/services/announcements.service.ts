import { supabase } from '../lib/supabase';

export interface AdminAnnouncement {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  createdByName?: string;
}

/** Fetch all announcements with creator name */
export async function fetchAnnouncements(): Promise<AdminAnnouncement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      id, title, content, is_active, created_by, created_at,
      users!announcements_created_by_fkey ( full_name, username )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((a: any): AdminAnnouncement => ({
    id: a.id,
    title: a.title,
    content: a.content,
    isActive: a.is_active,
    createdBy: a.created_by,
    createdAt: a.created_at,
    createdByName: a.users?.full_name ?? a.users?.username,
  }));
}

/** Create a new announcement */
export async function createAnnouncement(
  title: string,
  content: string,
  isActive: boolean,
  createdBy?: string,
) {
  const { error } = await supabase.from('announcements').insert({
    title,
    content,
    is_active: isActive,
    created_by: createdBy ?? null,
  });
  if (error) throw error;
}

/** Update an existing announcement */
export async function updateAnnouncement(
  id: string,
  updates: Partial<{ title: string; content: string; isActive: boolean }>,
) {
  const { error } = await supabase
    .from('announcements')
    .update({
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.content !== undefined && { content: updates.content }),
      ...(updates.isActive !== undefined && { is_active: updates.isActive }),
    })
    .eq('id', id);
  if (error) throw error;
}

/** Toggle active state of an announcement */
export async function toggleAnnouncementActive(id: string, isActive: boolean) {
  const { error } = await supabase
    .from('announcements')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
}

/** Delete an announcement */
export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
