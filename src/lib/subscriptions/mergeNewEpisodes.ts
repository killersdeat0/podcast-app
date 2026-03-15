import type { Episode } from '@/lib/rss/parser'

/**
 * Merges RSS feed new episodes with DB-cached episodes (which may have aged out of the feed).
 * Deduplicates by guid and sorts newest-first.
 */
export function mergeNewEpisodes(rssEpisodes: Episode[], storedEpisodes: Episode[]): Episode[] {
  const rssGuids = new Set(rssEpisodes.map((ep) => ep.guid))
  const extra = storedEpisodes.filter((ep) => !rssGuids.has(ep.guid))
  return [...rssEpisodes, ...extra].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  )
}
