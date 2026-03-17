import { createClient } from '@/lib/supabase/server'

/**
 * Returns true if the given userId owns the playlist with playlistId.
 * Uses the server client (RLS-aware).
 */
export async function verifyPlaylistOwnership(playlistId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playlists')
    .select('user_id')
    .eq('id', playlistId)
    .single()
  return data?.user_id === userId
}
