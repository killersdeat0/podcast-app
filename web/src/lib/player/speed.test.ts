import { describe, it, expect } from 'vitest'
import {
  ALL_SPEEDS,
  FREE_SPEEDS,
  GLOBAL_SPEED_KEY,
  perShowSpeedKey,
  snapToValidSpeed,
  resolveEpisodeSpeed,
  saveSpeedPreference,
} from './speed'

// ---------------------------------------------------------------------------
// perShowSpeedKey
// ---------------------------------------------------------------------------

describe('perShowSpeedKey', () => {
  it('returns the correct localStorage key for a feedUrl', () => {
    expect(perShowSpeedKey('https://feed.example.com/rss')).toBe(
      'podcast-speed-https://feed.example.com/rss',
    )
  })
})

// ---------------------------------------------------------------------------
// snapToValidSpeed
// ---------------------------------------------------------------------------

describe('snapToValidSpeed', () => {
  it('returns the speed unchanged when it is already in the list', () => {
    expect(snapToValidSpeed(1.5, ALL_SPEEDS)).toBe(1.5)
    expect(snapToValidSpeed(1, FREE_SPEEDS)).toBe(1)
    expect(snapToValidSpeed(2, FREE_SPEEDS)).toBe(2)
  })

  it('rounds to the nearest valid speed', () => {
    // 1.3 is closer to 1.25 than 1.5
    expect(snapToValidSpeed(1.3, ALL_SPEEDS)).toBe(1.25)
    // 1.6 is closer to 1.5 than 1.75
    expect(snapToValidSpeed(1.6, ALL_SPEEDS)).toBe(1.5)
    // 1.9 is closer to 2 than 1.75
    expect(snapToValidSpeed(1.9, ALL_SPEEDS)).toBe(2)
  })

  it('snaps to nearest free speed (1 or 2)', () => {
    // 0.8 is closer to 1
    expect(snapToValidSpeed(0.8, FREE_SPEEDS)).toBe(1)
    // 1.7 is closer to 2
    expect(snapToValidSpeed(1.7, FREE_SPEEDS)).toBe(2)
    // 1.5 is a tie — reduce returns the first match (1)
    expect(snapToValidSpeed(1.5, FREE_SPEEDS)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// resolveEpisodeSpeed — helper to build a minimal storage mock
// ---------------------------------------------------------------------------

function makeStorage(entries: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => entries[k] ?? null }
}

describe('resolveEpisodeSpeed', () => {
  const feedUrl = 'https://feed.example.com/rss'

  it('returns globalSpeed when no per-show speed is stored', () => {
    const storage = makeStorage({})
    expect(resolveEpisodeSpeed(feedUrl, 1.5, false, storage)).toBe(1.5)
  })

  it('returns the stored per-show speed for paid users', () => {
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: '1.75' })
    expect(resolveEpisodeSpeed(feedUrl, 1, false, storage)).toBe(1.75)
  })

  it('falls back to globalSpeed when the stored value is not a number', () => {
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: 'not-a-number' })
    expect(resolveEpisodeSpeed(feedUrl, 1.5, false, storage)).toBe(1.5)
  })

  it('clamps stored speed to 2x for free-tier users', () => {
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: '2.5' })
    expect(resolveEpisodeSpeed(feedUrl, 1, true, storage)).toBe(2)
  })

  it('snaps a clamped free-tier speed to the nearest valid free speed', () => {
    // Stored 1.7 → clamped to 1.7 → snapped to 2 (nearest in FREE_SPEEDS)
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: '1.7' })
    expect(resolveEpisodeSpeed(feedUrl, 1, true, storage)).toBe(2)
  })

  it('applies a valid free-tier speed without modification', () => {
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: '1' })
    expect(resolveEpisodeSpeed(feedUrl, 2, true, storage)).toBe(1)
  })

  it('returns globalSpeed for free-tier when stored value is 0.5 (clamped and snapped to 1)', () => {
    const storage = makeStorage({ [`podcast-speed-${feedUrl}`]: '0.5' })
    // 0.5 → min(2, 0.5) = 0.5 → snapToValidSpeed(0.5, [1, 2]) = 1
    expect(resolveEpisodeSpeed(feedUrl, 1, true, storage)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// saveSpeedPreference
//
// NOTE: saveSpeedPreference is NO LONGER called from Player.tsx. Speed changes
// in the player are ephemeral (session only) and do not persist to localStorage.
// Per-show speed is now set explicitly on the podcast detail page (paid users only)
// and stored as `podcast-speed-{feedUrl}` in localStorage.
// Global default speed is set in Settings and stored as `playback-speed`.
//
// saveSpeedPreference is kept in speed.ts as a utility in case it is needed
// elsewhere, but the following tests document its standalone behaviour.
// ---------------------------------------------------------------------------

describe('saveSpeedPreference', () => {
  function makeWritableStorage(): Pick<Storage, 'setItem'> & { store: Record<string, string> } {
    const store: Record<string, string> = {}
    return {
      store,
      setItem: (k: string, v: string) => { store[k] = v },
    }
  }

  it('saves global and per-show speed for paid users', () => {
    const storage = makeWritableStorage()
    saveSpeedPreference(1.5, 'https://feed.example.com/rss', false, storage)
    expect(storage.store[GLOBAL_SPEED_KEY]).toBe('1.5')
    expect(storage.store['podcast-speed-https://feed.example.com/rss']).toBe('1.5')
  })

  it('does NOT save anything for free-tier users', () => {
    const storage = makeWritableStorage()
    saveSpeedPreference(2, 'https://feed.example.com/rss', true, storage)
    expect(storage.store).toEqual({})
  })

  it('saves only global speed when feedUrl is undefined', () => {
    const storage = makeWritableStorage()
    saveSpeedPreference(1.25, undefined, false, storage)
    expect(storage.store[GLOBAL_SPEED_KEY]).toBe('1.25')
    expect(Object.keys(storage.store)).toHaveLength(1)
  })
})
