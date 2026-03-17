import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addEpisodeToPlaylist } from './addEpisodeToPlaylist'

const EPISODE = {
  guid: 'ep-1',
  feedUrl: 'https://feed.example.com/rss',
  title: 'Test Episode',
  audioUrl: 'https://audio.example.com/ep1.mp3',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('addEpisodeToPlaylist', () => {
  it('POSTs to the correct endpoint', async () => {
    await addEpisodeToPlaylist('pl-123', EPISODE)
    expect(fetch).toHaveBeenCalledWith(
      '/api/playlists/pl-123/episodes',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('dispatches playlist-episodes-changed with the playlistId', async () => {
    const events: CustomEvent[] = []
    const handler = (e: Event) => events.push(e as CustomEvent)
    window.addEventListener('playlist-episodes-changed', handler)

    await addEpisodeToPlaylist('pl-123', EPISODE)

    window.removeEventListener('playlist-episodes-changed', handler)
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ playlistId: 'pl-123' })
  })

  it('dispatches with the correct playlistId when multiple are used', async () => {
    const events: CustomEvent[] = []
    const handler = (e: Event) => events.push(e as CustomEvent)
    window.addEventListener('playlist-episodes-changed', handler)

    await addEpisodeToPlaylist('pl-abc', EPISODE)
    await addEpisodeToPlaylist('pl-xyz', EPISODE)

    window.removeEventListener('playlist-episodes-changed', handler)
    expect(events[0].detail.playlistId).toBe('pl-abc')
    expect(events[1].detail.playlistId).toBe('pl-xyz')
  })
})
