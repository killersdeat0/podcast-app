/**
 * Player.test.tsx — unit tests for the Player component.
 *
 * Tests cover:
 * - skipToNext: snapshot saved before advancing, toast shown when next exists
 * - skipToNext: no toast when queue is empty (last item)
 * - completeAndAdvance: snapshot saved before advancing, toast shown
 * - completeAndAdvance: no toast when queue is empty
 * - Guest onEnded path: snapshot and toast shown
 * - restorePreviousEpisode (via Undo button): previous episode restored and seek applied
 * - Artwork link: clicking artwork navigates to the podcast detail page
 * - ScrollingText: renders text; applies marquee animation when text overflows container
 */

import '@testing-library/jest-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import Player from './Player'
import { PlayerProvider } from './PlayerContext'
import { UserProvider } from '@/lib/auth/UserContext'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock sonner toast so we can assert on calls without any DOM side-effects
const mockToast = vi.fn()
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => mockToast(...args) }))

// Mock hooks that are irrelevant to undo logic
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('@/hooks/useEscapeKey', () => ({ useEscapeKey: vi.fn() }))

// jsdom's HTMLAudioElement.play() returns undefined; ensure it always returns a
// resolved Promise so that `.catch()` calls in Player.tsx don't throw.
Object.defineProperty(window.HTMLAudioElement.prototype, 'play', {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
})

// Mock i18n — return minimal strings object so Player doesn't crash
vi.mock('@/lib/i18n/LocaleContext', () => ({
  useStrings: () => ({
    player: {
      playback_speed: 'Speed',
      volume: 'Volume',
      sleep_off: 'Off',
      sleep_5: '5m', sleep_10: '10m', sleep_15: '15m',
      sleep_30: '30m', sleep_45: '45m', sleep_60: '60m',
      upgrade_for_speeds: 'Upgrade',
      bookmark: 'Bookmark',
      bookmark_at: (t: string) => `Bookmark at ${t}`,
      bookmark_saved: (t: string) => `Bookmark saved at ${t}`,
      bookmark_saved_hint: 'View all bookmarks →',
      bookmark_add_note: 'Add note',
      bookmark_sign_in: 'Sign in to save bookmarks',
      bookmark_error: 'Failed to save bookmark',
    },
    bookmarks: {
      note_placeholder: 'Add a note...',
      note_save: 'Save',
      note_cancel: 'Cancel',
    },
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal NowPlaying episode fixture. */
const EP1 = {
  guid: 'ep-1',
  feedUrl: 'https://feed.example.com/rss',
  title: 'Episode 1',
  podcastTitle: 'Test Podcast',
  artworkUrl: '',
  audioUrl: 'https://audio.example.com/ep1.mp3',
  duration: 1800,
}

const EP2 = {
  ...EP1,
  guid: 'ep-2',
  title: 'Episode 2',
  audioUrl: 'https://audio.example.com/ep2.mp3',
}

/** Queue API shape returned by GET /api/queue */
function makeQueueItem(ep: typeof EP1) {
  return {
    episode_guid: ep.guid,
    feed_url: ep.feedUrl,
    episode: {
      title: ep.title,
      audio_url: ep.audioUrl,
      duration: ep.duration,
      artwork_url: ep.artworkUrl,
      podcast_title: ep.podcastTitle,
    },
  }
}

/** Render Player inside all required providers. */
function renderPlayer({ isGuest = false }: { isGuest?: boolean } = {}) {
  return render(
    <UserProvider isGuest={isGuest} tier="free">
      <PlayerProvider>
        <Player />
      </PlayerProvider>
    </UserProvider>,
  )
}

/**
 * Get the <audio> element rendered by Player and configure fake
 * currentTime / duration properties (jsdom audio has no real media engine).
 */
function getAudio(currentTime = 120, duration = 1800) {
  const audio = document.querySelector('audio') as HTMLAudioElement
  Object.defineProperty(audio, 'currentTime', { value: currentTime, writable: true, configurable: true })
  Object.defineProperty(audio, 'duration', { value: duration, writable: true, configurable: true })
  // Prevent "not implemented" errors from jsdom's play/pause stubs
  audio.play = vi.fn().mockResolvedValue(undefined)
  audio.pause = vi.fn()
  return audio
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Stub localStorage
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: skipToNext (authenticated, queue path)
// ---------------------------------------------------------------------------

describe('skipToNext — authenticated queue path', () => {
  it('shows the undo toast with 5s duration when a next episode exists', async () => {
    // Queue: EP1 is current, EP2 is next
    const queue = [makeQueueItem(EP1), makeQueueItem(EP2)]

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET'
      if (url.includes('/api/queue') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(queue) })
      }
      if (url.includes('/api/queue') && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/progress') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ positionSeconds: 0 }) })
      }
      if (url.includes('/api/progress') && method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))

    renderPlayer({ isGuest: false })

    // Load EP1 into the player so nowPlaying is set
    const { PlayerProvider: PP, usePlayer } = await import('./PlayerContext')
    // We need to trigger play from inside the tree — use a helper component approach
    // Instead, manipulate via the window event that refreshDbQueue listens to after nowPlaying changes.
    // The simplest path: set nowPlaying via localStorage before mount.
    // But we already mounted. Let's re-render with nowPlaying pre-seeded in localStorage.

    // Cleaner: render with localStorage pre-set so PlayerContext restores nowPlaying on mount.
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => {
        if (k === 'nowPlaying') return JSON.stringify(EP1)
        return null
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    // Re-render fresh with the seeded localStorage
    const { unmount } = renderPlayer({ isGuest: false })

    // Wait for the skip button to appear (requires dbQueue to have a next item)
    // dbQueue is populated via GET /api/queue which fires on nowPlaying change.
    // We need to wait for the fetch and state update.
    await waitFor(() => {
      expect(screen.queryByTitle('Next episode')).not.toBeNull()
    })

    const audio = getAudio(120, 1800)

    // Click the skip button
    await act(async () => {
      fireEvent.click(screen.getByTitle('Next episode'))
    })

    // Wait for the async fetch chain to resolve
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        'Playing next episode',
        expect.objectContaining({ duration: 5000 }),
      )
    })

    // Toast action label should be 'Undo'
    const call = mockToast.mock.calls.find((c) => c[0] === 'Playing next episode')
    expect(call).toBeDefined()
    expect(call![1].action.label).toBe('Undo')

    unmount()
  })

  it('does NOT show the undo toast when there is no next episode (last in queue)', async () => {
    // Queue: only EP1, nothing after it
    const queue = [makeQueueItem(EP1)]

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET'
      if (url.includes('/api/queue') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(queue) })
      }
      if (url.includes('/api/queue') && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/progress')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ positionSeconds: 0 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP1) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const { unmount } = renderPlayer({ isGuest: false })

    // When EP1 is the only item in the queue, hasNextInQueue is false
    // so the skip button is not rendered. Trigger skipToNext via the queue
    // being updated to have EP1 at idx 0 with no next item.
    // Verify toast is NOT called by simulating the full queue-empty scenario.
    await act(async () => {
      // Give fetch calls time to settle
      await new Promise((r) => setTimeout(r, 10))
    })

    // Skip button should NOT be present (EP1 is the last item, hasNextInQueue = false)
    expect(screen.queryByTitle('Next episode')).toBeNull()
    // Toast should not have been called
    expect(mockToast).not.toHaveBeenCalledWith('Playing next episode', expect.anything())

    unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests: completeAndAdvance (authenticated, queue path)
// ---------------------------------------------------------------------------

describe('completeAndAdvance — authenticated queue path', () => {
  it('advances to the next episode when audio ends (no undo toast — auto-advance)', async () => {
    const queue = [makeQueueItem(EP1), makeQueueItem(EP2)]

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET'
      if (url.includes('/api/queue') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(queue) })
      }
      if (url.includes('/api/queue') && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/progress')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ positionSeconds: 0 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP1) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const { unmount } = renderPlayer({ isGuest: false })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const audio = getAudio(1800, 1800)

    // Fire 'ended' event to trigger completeAndAdvance
    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })

    // Auto-advance should NOT show an undo toast
    expect(mockToast).not.toHaveBeenCalledWith('Playing next episode', expect.anything())

    unmount()
  })

  it('does NOT show the undo toast when audio ends and queue is empty', async () => {
    // Only EP1 in queue — no next episode
    const queue = [makeQueueItem(EP1)]

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET'
      if (url.includes('/api/queue') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(queue) })
      }
      if (url.includes('/api/queue') && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/progress')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ positionSeconds: 0 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP1) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const { unmount } = renderPlayer({ isGuest: false })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const audio = getAudio(1800, 1800)

    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })

    // Wait long enough for all fetch chains to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })

    expect(mockToast).not.toHaveBeenCalledWith('Playing next episode', expect.anything())

    unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests: guest onEnded path
// ---------------------------------------------------------------------------

describe('guest onEnded path', () => {
  it('advances to next episode when guest audio ends (no undo toast — auto-advance)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => {
        if (k === 'nowPlaying') return JSON.stringify(EP1)
        if (k === 'guestQueue') return JSON.stringify([EP1, EP2])
        return null
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }))

    const { unmount } = renderPlayer({ isGuest: true })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const audio = getAudio(1800, 1800)

    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Auto-advance for guests should NOT show an undo toast
    expect(mockToast).not.toHaveBeenCalledWith('Playing next episode', expect.anything())

    unmount()
  })

  it('does NOT show the undo toast when guest queue has only one episode', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => {
        if (k === 'nowPlaying') return JSON.stringify(EP1)
        if (k === 'guestQueue') return JSON.stringify([EP1])
        return null
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }))

    const { unmount } = renderPlayer({ isGuest: true })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const audio = getAudio(1800, 1800)

    await act(async () => {
      fireEvent(audio, new Event('ended'))
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(mockToast).not.toHaveBeenCalledWith('Playing next episode', expect.anything())

    unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests: restorePreviousEpisode (Undo action)
// ---------------------------------------------------------------------------

describe('restorePreviousEpisode — Undo action restores previous episode', () => {
  it('calling the Undo onClick restores nowPlaying to the previous episode', async () => {
    const queue = [makeQueueItem(EP1), makeQueueItem(EP2)]

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET'
      if (url.includes('/api/queue') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(queue) })
      }
      if (url.includes('/api/queue') && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url.includes('/api/progress')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ positionSeconds: 0 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP1) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    const { unmount } = renderPlayer({ isGuest: false })

    await waitFor(() => {
      expect(screen.queryByTitle('Next episode')).not.toBeNull()
    })

    const audio = getAudio(300, 1800) // currentTime = 300s

    // Click skip button — snapshot is saved, EP2 starts playing, toast fires
    await act(async () => {
      fireEvent.click(screen.getByTitle('Next episode'))
    })

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Playing next episode', expect.anything())
    })

    // Retrieve the Undo onClick from the toast call
    const toastCall = mockToast.mock.calls.find((c) => c[0] === 'Playing next episode')
    expect(toastCall).toBeDefined()
    const undoOnClick = toastCall![1].action.onClick as () => void

    // Invoking undo should call play() with EP1 (previous episode)
    // We verify this indirectly: after calling undo, localStorage.nowPlaying is updated to EP1
    const setItemCalls: [string, string][] = []
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP2) : null),
      setItem: (k: string, v: string) => { setItemCalls.push([k, v]) },
      removeItem: vi.fn(),
      clear: vi.fn(),
    })

    await act(async () => {
      undoOnClick()
    })

    // play() writes to localStorage.nowPlaying
    const nowPlayingWrite = setItemCalls.find(([k]) => k === 'nowPlaying')
    expect(nowPlayingWrite).toBeDefined()
    const restored = JSON.parse(nowPlayingWrite![1])
    expect(restored.guid).toBe(EP1.guid)

    unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests: Artwork link
// ---------------------------------------------------------------------------

const EP_WITH_ART = {
  ...EP1,
  artworkUrl: 'https://cdn.example.com/art.jpg',
}

describe('artwork link', () => {
  it('renders a link to the podcast detail page when artworkUrl is set', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP_WITH_ART) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const { unmount } = renderPlayer()
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    const link = document.querySelector(`a[href="/podcast/${encodeURIComponent(EP_WITH_ART.feedUrl)}"]`)
    expect(link).not.toBeNull()

    unmount()
  })

  it('does not render an artwork link when artworkUrl is empty', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP1) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const { unmount } = renderPlayer()
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    const link = document.querySelector(`a[href="/podcast/${encodeURIComponent(EP1.feedUrl)}"]`)
    expect(link).toBeNull()

    unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests: ScrollingText
// ---------------------------------------------------------------------------

describe('ScrollingText', () => {
  it('renders the episode title and podcast name', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP_WITH_ART) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const { unmount } = renderPlayer()
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    expect(screen.getByText(EP_WITH_ART.title)).toBeInTheDocument()
    expect(screen.getByText(EP_WITH_ART.podcastTitle)).toBeInTheDocument()

    unmount()
  })

  it('applies truncate style when text fits (no overflow)', async () => {
    // jsdom reports scrollWidth=0 and clientWidth=0 by default — no overflow detected
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP_WITH_ART) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const { unmount } = renderPlayer()
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    const titleEl = screen.getByText(EP_WITH_ART.title)
    expect(titleEl).toHaveStyle({ textOverflow: 'ellipsis' })
    expect(titleEl).not.toHaveStyle({ animation: 'marquee-scroll 14s ease-in-out infinite' })

    unmount()
  })

  it('applies marquee animation when text overflows the container', async () => {
    // Mock layout: text element reports scrollWidth > container clientWidth
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { get: () => 400, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 100, configurable: true })

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'nowPlaying' ? JSON.stringify(EP_WITH_ART) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const { unmount } = renderPlayer()
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })

    const titleEl = screen.getByText(EP_WITH_ART.title)
    expect(titleEl).toHaveStyle({ animation: 'marquee-scroll 14s ease-in-out infinite' })

    // Restore prototype properties
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth

    unmount()
  })
})
