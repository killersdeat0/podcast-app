import { NextRequest, NextResponse } from 'next/server'
import type { ItunesResult } from '@/lib/itunes/search'
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'podcast', 'show', 'official', 'weekly', 'daily', 'episode', 'episodes',
])

function cleanTerm(term: string): string {
  const cleaned = term
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w))
    .join(' ')
    .trim()
  return cleaned || term
}

/** Look up a podcast's genreIds via iTunes lookup. Cached 24hr.
 *  iTunes returns wrapperType "track" for podcasts and exposes genreIds[] directly.
 *  Filters out parent/generic categories (IDs below 1300, e.g. 26 = "Podcasts").
 *  Capped at 6 genres. */
async function getGenreIds(collectionId: string): Promise<number[]> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcast`,
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const podcast = (data.results ?? [])[0] as Record<string, unknown> | undefined
  const genreIds = podcast?.genreIds as string[] | undefined
  return (genreIds ?? []).map(Number).filter((id) => id >= 1300)
}

/** Fetch artistName for same-network search (reuses the 24h cached lookup).
 *  Next.js fetch deduplication means this is effectively free when called
 *  after getGenreIds for the same collectionId. */
async function fetchArtistName(collectionId: string): Promise<string | null> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcast`,
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) return null
  const data = await res.json()
  const podcast = (data.results ?? [])[0] as Record<string, unknown> | undefined
  return (podcast?.artistName as string) ?? null
}

const isDev = process.env.NODE_ENV === 'development'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const term = searchParams.get('term')
  const excludeId = searchParams.get('excludeId')
  const excludeFeedUrl = searchParams.get('excludeFeedUrl')
  const subscribedFeedUrls = new Set(
    (searchParams.get('subscribedFeedUrls') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  if (!term) return NextResponse.json({ results: [] })

  const cleanedTerm = cleanTerm(term)

  // Look up all specific genre IDs if we have a collectionId (cached 24hr)
  const genreIds = excludeId ? await getGenreIds(excludeId) : []
  // Cap genres to avoid excessive parallel requests (max 6 genres = max 12 searches)
  const cappedGenreIds = genreIds.slice(0, 6)

  // Fetch artistName for same-network search (cached 24hr, deduped with getGenreIds lookup)
  const artistName = excludeId ? await fetchArtistName(excludeId) : null

  // Run searches in parallel:
  // When genres are available: name+genre for each + genre-only for each
  // When no genres: fall back to name-only search
  let nameAndGenreResults: ItunesResult[] = []
  let networkResults: ItunesResult[] = []
  let genreOnlyResults: ItunesResult[] = []

  if (cappedGenreIds.length > 0) {
    const cleanedArtist = artistName ? cleanTerm(artistName) : null

    const searchResults = await Promise.all([
      ...cappedGenreIds.map((genreId) =>
        fetch(
          `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(cleanedTerm)}&genreId=${genreId}&limit=20`,
          { next: { revalidate: 86400 } }
        )
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((d) => (d.results ?? []) as ItunesResult[])
      ),
      // Same-network/producer searches (only when artistName is available)
      ...(cleanedArtist
        ? [
            fetch(
              `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(cleanedArtist)}&limit=20`,
              { next: { revalidate: 86400 } }
            )
              .then((r) => (r.ok ? r.json() : { results: [] }))
              .then((d) => (d.results ?? []) as ItunesResult[]),
            ...cappedGenreIds.map((genreId) =>
              fetch(
                `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(cleanedArtist)}&genreId=${genreId}&limit=10`,
                { next: { revalidate: 86400 } }
              )
                .then((r) => (r.ok ? r.json() : { results: [] }))
                .then((d) => (d.results ?? []) as ItunesResult[])
            ),
          ]
        : []),
      ...cappedGenreIds.map((genreId) =>
        fetch(
          `https://itunes.apple.com/search?media=podcast&term=podcast&genreId=${genreId}&limit=20`,
          { next: { revalidate: 86400 } }
        )
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((d) => (d.results ?? []) as ItunesResult[])
      ),
    ])

    const nameAndGenreCount = cappedGenreIds.length
    const networkCount = cleanedArtist ? 1 + cappedGenreIds.length : 0
    const genreOnlyCount = cappedGenreIds.length

    nameAndGenreResults = searchResults.slice(0, nameAndGenreCount).flat()
    const rawNetworkResults = searchResults.slice(nameAndGenreCount, nameAndGenreCount + networkCount).flat()
    // Cap network results to avoid one network dominating
    networkResults = rawNetworkResults.slice(0, 10)
    genreOnlyResults = searchResults.slice(nameAndGenreCount + networkCount, nameAndGenreCount + networkCount + genreOnlyCount).flat()
  } else {
    // No genre data — fall back to name-only search
    const res = await fetch(
      `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(cleanedTerm)}&limit=20`,
      { next: { revalidate: 86400 } }
    )
    nameAndGenreResults = res.ok ? ((await res.json()).results ?? []) : []
  }

  // Merge in priority order, deduplicating by collectionId (first occurrence wins):
  // name+genre > network/producer > genre-only
  const seen = new Set<number>()
  const merged: ItunesResult[] = []
  for (const result of [...nameAndGenreResults, ...networkResults, ...genreOnlyResults]) {
    if (!seen.has(result.collectionId)) {
      seen.add(result.collectionId)
      merged.push(result)
    }
  }

  const withFeedUrl = merged.filter((r) => r.feedUrl)
  const afterExcludeId = withFeedUrl.filter((r) => !excludeId || String(r.collectionId) !== excludeId)
  const afterExcludeFeed = afterExcludeId.filter((r) => !excludeFeedUrl || r.feedUrl !== excludeFeedUrl)
  const afterSubscriptions = afterExcludeFeed.filter((r) => !subscribedFeedUrls.has(r.feedUrl))
  const afterQualityFilter = afterSubscriptions.filter((r) => !r.trackCount || r.trackCount >= 5)
  const results = afterQualityFilter.slice(0, 6)

  const debug = isDev ? {
    cleanedTerm,
    originalTerm: term,
    genreIds,
    artistName,
    passes: {
      nameAndGenre: nameAndGenreResults.length,
      network: networkResults.length,
      genreOnly: genreOnlyResults.length,
      cappedGenreIds,
    },
    filtering: {
      mergedTotal: merged.length,
      removedMissingFeedUrl: merged.length - withFeedUrl.length,
      removedById: withFeedUrl.length - afterExcludeId.length,
      removedByFeedUrl: afterExcludeId.length - afterExcludeFeed.length,
      removedBySubscription: afterExcludeFeed.length - afterSubscriptions.length,
      removedByQualityFilter: afterSubscriptions.length - afterQualityFilter.length,
      remaining: afterQualityFilter.length,
    },
  } : undefined

  return NextResponse.json({ results, ...(debug ? { debug } : {}) })
}
