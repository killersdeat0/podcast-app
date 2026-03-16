import type { Episode } from '@/lib/rss/parser'

/**
 * Merges RSS and iTunes episode lists for search.
 * RSS entries take priority (richer metadata); iTunes fills in episodes
 * not present in the RSS feed (older episodes that aged out of the feed).
 * Deduplicates by guid.
 */
export function mergeEpisodeSources(rssEpisodes: Episode[], itunesEpisodes: Episode[]): Episode[] {
  const rssGuids = new Set(rssEpisodes.map((ep) => ep.guid))
  const extra = itunesEpisodes.filter((ep) => !rssGuids.has(ep.guid))
  return [...rssEpisodes, ...extra]
}
