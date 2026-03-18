export interface PlaylistEpisodePayload {
  guid: string
  feedUrl: string
  title: string
  audioUrl: string
  artworkUrl?: string | null
  podcastTitle?: string
  duration?: number
  pubDate?: string
  description?: string
}

export async function addEpisodeToPlaylist(playlistId: string, episode: PlaylistEpisodePayload): Promise<void> {
  const res = await fetch(`/api/playlists/${playlistId}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(episode),
  }).catch(() => null)
  if (!res || !res.ok) {
    const { toast } = await import('sonner')
    const body = res ? await res.json().catch(() => ({})) : {}
    toast.error(body.error ?? 'Failed to add episode to playlist')
    throw new Error(body.error ?? 'Failed to add episode to playlist')
  }
  window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId } }))
}
