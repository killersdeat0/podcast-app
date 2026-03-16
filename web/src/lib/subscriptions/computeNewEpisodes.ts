import type { Episode } from '@/lib/rss/parser'
import { mergeNewEpisodes } from './mergeNewEpisodes'

interface Options {
  episodes: Episode[]
  storedNewEpisodes: Episode[]
  oldLastVisitedAt: string | null
  subscription: { episode_filter: string | null } | null
  tier: 'free' | 'paid'
  isGuest: boolean
}

/**
 * Computes the list of "new" episodes for a podcast page visit.
 * Returns [] for guests (no subscription state to compare against).
 * Respects the episode_filter setting for both free and paid users.
 */
export function computeNewEpisodes({
  episodes,
  storedNewEpisodes,
  oldLastVisitedAt,
  subscription,
  tier,
  isGuest,
}: Options): Episode[] {
  if (isGuest) return []
  if (episodes.length === 0) return []

  const filter = subscription?.episode_filter
  const rssBaseEps = oldLastVisitedAt
    ? episodes.filter((ep) => new Date(ep.pubDate) > new Date(oldLastVisitedAt))
    : episodes
  const baseEps = mergeNewEpisodes(rssBaseEps, storedNewEpisodes)

  if (tier !== 'paid') {
    // Free: null (no subscription) or '*' = all new episodes; '' = opted out
    return filter === '' ? [] : baseEps
  }
  // Paid
  if (!filter) return []          // no setting = no notifications
  if (filter === '*') return baseEps
  const f = filter.toLowerCase()
  return baseEps.filter((ep) => ep.title.toLowerCase().includes(f))
}
