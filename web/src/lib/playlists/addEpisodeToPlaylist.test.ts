import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'
import { addEpisodeToPlaylist } from './addEpisodeToPlaylist'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const EPISODE = {
  guid: 'ep-1',
  feedUrl: 'https://feed.example.com/rss',
  title: 'Test Episode',
  audioUrl: 'https://audio.example.com/ep1.mp3',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.clearAllMocks()
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

  it('dispatches playlist-episodes-changed with the playlistId on success', async () => {
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

  it('shows a toast and throws when the server returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Episode limit reached. Upgrade for unlimited episodes per playlist.' }),
    }))

    await expect(addEpisodeToPlaylist('pl-123', EPISODE))
      .rejects.toThrow('Episode limit reached. Upgrade for unlimited episodes per playlist.')
    expect(toast.error).toHaveBeenCalledWith('Episode limit reached. Upgrade for unlimited episodes per playlist.')
  })

  it('uses a fallback message when the error body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    }))

    await expect(addEpisodeToPlaylist('pl-123', EPISODE))
      .rejects.toThrow('Failed to add episode to playlist')
    expect(toast.error).toHaveBeenCalledWith('Failed to add episode to playlist')
  })

  it('does not dispatch playlist-episodes-changed when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Episode limit reached.' }),
    }))

    const events: CustomEvent[] = []
    const handler = (e: Event) => events.push(e as CustomEvent)
    window.addEventListener('playlist-episodes-changed', handler)

    await addEpisodeToPlaylist('pl-123', EPISODE).catch(() => {})

    window.removeEventListener('playlist-episodes-changed', handler)
    expect(events).toHaveLength(0)
  })

  it('handles a network failure with a fallback toast and throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    await expect(addEpisodeToPlaylist('pl-123', EPISODE))
      .rejects.toThrow('Failed to add episode to playlist')
    expect(toast.error).toHaveBeenCalledWith('Failed to add episode to playlist')
  })
})
