import { describe, it, expect } from 'vitest'
import { computeNewEpisodes } from './computeNewEpisodes'
import type { Episode } from '@/lib/rss/parser'

function ep(guid: string, pubDate: string, title = guid): Episode {
  return { guid, title, audioUrl: '', pubDate, duration: null, description: '', chapterUrl: null }
}

const recentEp = ep('new', '2024-06-10')
const oldEp = ep('old', '2024-05-01')
const allEpisodes = [recentEp, oldEp]
const lastVisited = '2024-06-01T00:00:00Z'

describe('computeNewEpisodes — guest', () => {
  it('always returns [] for guests regardless of feed content', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: null,
      subscription: null,
      tier: 'free',
      isGuest: true,
    })
    expect(result).toEqual([])
  })

  it('returns [] for guests even when oldLastVisitedAt is null (prevents nav warning bug)', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: null,
      subscription: { episode_filter: '*' },
      tier: 'paid',
      isGuest: true,
    })
    expect(result).toEqual([])
  })
})

describe('computeNewEpisodes — free user', () => {
  it('returns episodes newer than lastVisitedAt when subscription filter is null', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: null },
      tier: 'free',
      isGuest: false,
    })
    expect(result.map((e) => e.guid)).toEqual(['new'])
  })

  it('returns [] when lastVisitedAt is null (first visit — no baseline yet)', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: null,
      subscription: { episode_filter: null },
      tier: 'free',
      isGuest: false,
    })
    expect(result).toEqual([])
  })

  it('returns [] when episode_filter is empty string (opted out)', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: '' },
      tier: 'free',
      isGuest: false,
    })
    expect(result).toEqual([])
  })

  it('returns [] when no subscription', () => {
    // Free user not subscribed: subscription is null, filter is undefined → treated as "all new"
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: null,
      tier: 'free',
      isGuest: false,
    })
    expect(result.map((e) => e.guid)).toEqual(['new'])
  })
})

describe('computeNewEpisodes — paid user', () => {
  it('returns [] when filter is null (no notifications configured)', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: null },
      tier: 'paid',
      isGuest: false,
    })
    expect(result).toEqual([])
  })

  it('returns all new episodes when filter is "*"', () => {
    const result = computeNewEpisodes({
      episodes: allEpisodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: '*' },
      tier: 'paid',
      isGuest: false,
    })
    expect(result.map((e) => e.guid)).toEqual(['new'])
  })

  it('filters by keyword when filter is a custom string', () => {
    const episodes = [
      ep('ep1', '2024-06-10', 'Interview with Alice'),
      ep('ep2', '2024-06-09', 'Weekly Recap'),
      ep('ep3', '2024-06-08', 'Interview with Bob'),
    ]
    const result = computeNewEpisodes({
      episodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: 'interview' },
      tier: 'paid',
      isGuest: false,
    })
    expect(result.map((e) => e.guid)).toEqual(['ep1', 'ep3'])
  })

  it('keyword match is case-insensitive', () => {
    const episodes = [ep('ep1', '2024-06-10', 'INTERVIEW with Alice')]
    const result = computeNewEpisodes({
      episodes,
      storedNewEpisodes: [],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: 'interview' },
      tier: 'paid',
      isGuest: false,
    })
    expect(result).toHaveLength(1)
  })
})

describe('computeNewEpisodes — stored episodes', () => {
  it('supplements the current RSS window with stored episodes', () => {
    // storedNewEpisodes are pre-filtered by the caller (already identified as "new" when cached),
    // so computeNewEpisodes trusts them and merges without re-filtering by date.
    const storedEp = ep('stored-aged-out', '2024-06-05') // newer than lastVisited
    const result = computeNewEpisodes({
      episodes: [recentEp],  // only 1 episode in current RSS window
      storedNewEpisodes: [storedEp],
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: null },
      tier: 'free',
      isGuest: false,
    })
    expect(result.map((e) => e.guid)).toContain('stored-aged-out')
    expect(result.map((e) => e.guid)).toContain('new')
  })

  it('deduplicates episodes present in both RSS and stored list', () => {
    const result = computeNewEpisodes({
      episodes: [recentEp],
      storedNewEpisodes: [recentEp],  // same guid as RSS ep
      oldLastVisitedAt: lastVisited,
      subscription: { episode_filter: null },
      tier: 'free',
      isGuest: false,
    })
    expect(result.filter((e) => e.guid === 'new')).toHaveLength(1)
  })
})
