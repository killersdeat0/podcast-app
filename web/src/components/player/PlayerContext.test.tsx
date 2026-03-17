import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './PlayerContext'
import type { PlaylistEpisodeRef, NowPlaying } from './PlayerContext'

beforeEach(() => {
  const storage: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v },
    removeItem: (k: string) => { delete storage[k] },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const EP1: PlaylistEpisodeRef = {
  guid: 'ep-1',
  feedUrl: 'https://feed.example.com/rss',
  title: 'Episode 1',
  podcastTitle: 'Test Podcast',
  artworkUrl: '',
  audioUrl: 'https://audio.example.com/ep1.mp3',
  duration: 1800,
}

const EP2: PlaylistEpisodeRef = {
  ...EP1,
  guid: 'ep-2',
  title: 'Episode 2',
  audioUrl: 'https://audio.example.com/ep2.mp3',
}

function makeNowPlaying(overrides?: Partial<NowPlaying>): NowPlaying {
  return { ...EP1, ...overrides }
}

describe('PlayerContext — updatePlaylistEpisodes', () => {
  it('updates episodes in playlistContext without changing current episode', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper: PlayerProvider })

    act(() => {
      result.current.play(makeNowPlaying({
        playlistContext: { playlistId: 'pl-1', episodes: [EP1] },
      }))
    })

    expect(result.current.nowPlaying?.playlistContext?.episodes).toHaveLength(1)

    act(() => {
      result.current.updatePlaylistEpisodes([EP1, EP2])
    })

    const ctx = result.current.nowPlaying?.playlistContext
    expect(ctx?.episodes).toHaveLength(2)
    expect(ctx?.episodes[1].guid).toBe('ep-2')
    // playlistId and current episode guid are unchanged
    expect(ctx?.playlistId).toBe('pl-1')
    expect(result.current.nowPlaying?.guid).toBe('ep-1')
  })

  it('does nothing when nowPlaying has no playlistContext', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper: PlayerProvider })

    act(() => {
      result.current.play(makeNowPlaying()) // no playlistContext
    })

    const before = result.current.nowPlaying

    act(() => {
      result.current.updatePlaylistEpisodes([EP1, EP2])
    })

    expect(result.current.nowPlaying).toBe(before)
  })

  it('persists updated episodes to localStorage', () => {
    const { result } = renderHook(() => usePlayer(), { wrapper: PlayerProvider })

    act(() => {
      result.current.play(makeNowPlaying({
        playlistContext: { playlistId: 'pl-1', episodes: [EP1] },
      }))
    })

    act(() => {
      result.current.updatePlaylistEpisodes([EP1, EP2])
    })

    const stored = JSON.parse(localStorage.getItem('nowPlaying') ?? '{}')
    expect(stored.playlistContext.episodes).toHaveLength(2)
    expect(stored.playlistContext.episodes[1].guid).toBe('ep-2')
  })
})
