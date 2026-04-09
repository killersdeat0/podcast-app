export type { ItunesResult } from '@/lib/itunes/search'
import type { ItunesResult } from '@/lib/itunes/search'

export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'podcast', 'show', 'official', 'weekly', 'daily', 'episode', 'episodes',
])

/** Strips stop words from a podcast title to produce a cleaner search term. */
export function cleanTerm(title: string): string {
  const cleaned = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w))
    .join(' ')
    .trim()
  return cleaned || title
}

/** Look up a podcast's genreIds via iTunes lookup. Cached 24hr.
 *  iTunes returns wrapperType "track" for podcasts and exposes genreIds[] directly.
 *  Filters out parent/generic categories (IDs below 1300, e.g. 26 = "Podcasts").
 *  Capped at 6 genres. */
export async function fetchGenreIds(collectionId: string): Promise<number[]> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcast`,
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const podcast = (data.results ?? [])[0] as Record<string, unknown> | undefined
  const genreIds = podcast?.genreIds as string[] | undefined
  return (genreIds ?? []).map(Number).filter((id) => id >= 1300).slice(0, 6)
}

/** Perform a single iTunes podcast search. Cached 24hr. */
export async function searchItunes(params: {
  term: string
  genreId?: number
  limit?: number
}): Promise<ItunesResult[]> {
  const { term, genreId, limit = 20 } = params
  let url = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=${limit}`
  if (genreId !== undefined) url += `&genreId=${genreId}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? []) as ItunesResult[]
}

/** Deduplicate iTunes results by collectionId; first occurrence wins. */
export function deduplicateById(results: ItunesResult[]): ItunesResult[] {
  const seen = new Set<number>()
  const out: ItunesResult[] = []
  for (const r of results) {
    if (!seen.has(r.collectionId)) {
      seen.add(r.collectionId)
      out.push(r)
    }
  }
  return out
}

/** Remove results whose feedUrl is in the subscribed list. */
export function filterSubscribed(
  results: ItunesResult[],
  subscribedFeedUrls: string[]
): ItunesResult[] {
  const set = new Set(subscribedFeedUrls)
  return results.filter((r) => !set.has(r.feedUrl))
}
