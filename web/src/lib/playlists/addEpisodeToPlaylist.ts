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
  await fetch(`/api/playlists/${playlistId}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(episode),
  }).catch(() => {})
  window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId } }))
}
