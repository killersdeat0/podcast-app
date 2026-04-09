import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ItunesResult } from '@/lib/itunes/search'


/** Look up a podcast's genreIds via iTunes lookup. Cached 24hr. */
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

const isDev = process.env.NODE_ENV === 'development'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Fetch user's subscriptions and listening stats in parallel
  const [{ data: subscriptions, error }, { data: listeningStats }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('feed_url, title, collection_id, last_visited_at, subscribed_at')
      .eq('user_id', user.id),
    supabase
      .from('listening_by_show')
      .select('feed_url, seconds_listened')
      .eq('user_id', user.id),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 3. If 0 subscriptions, return empty
  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const subscribedFeedUrls = new Set(subscriptions.map((s) => s.feed_url))
  const listenMap = new Map((listeningStats ?? []).map((l) => [l.feed_url, l.seconds_listened]))

  // 4. Pick top seeds: sort by seconds_listened DESC, then last_visited_at DESC as fallback
  //    Filter to those with non-null collection_id
  const sorted = [...subscriptions].sort((a, b) => {
    const aSeconds = listenMap.get(a.feed_url) ?? 0
    const bSeconds = listenMap.get(b.feed_url) ?? 0
    if (bSeconds !== aSeconds) return bSeconds - aSeconds
    const aTime = a.last_visited_at ?? a.subscribed_at ?? ''
    const bTime = b.last_visited_at ?? b.subscribed_at ?? ''
    if (!aTime && !bTime) return 0
    if (!aTime) return 1
    if (!bTime) return -1
    return bTime < aTime ? -1 : bTime > aTime ? 1 : 0
  })

  // Seeds: top 2 by listen time (guaranteed signal) + 3 random from the rest
  const top2 = sorted.slice(0, 2)
  const rest = sorted.slice(2)
  const random3 = rest.sort(() => Math.random() - 0.5).slice(0, 3)
  const seeds = [...top2, ...random3]

  // Seeds for genre lookup — must have collection_id
  const genreSeeds = seeds.filter((s) => s.collection_id != null)

  // 5. Fetch iTunes genre IDs for each genre seed in parallel (cached 24hr)
  const genreIdsByCollection = await Promise.all(
    genreSeeds.map((s) => getGenreIds(String(s.collection_id)))
  )

  // 6. Aggregate genre frequency across seeds
  const genreFrequency = new Map<number, number>()
  for (const ids of genreIdsByCollection) {
    for (const id of ids) {
      genreFrequency.set(id, (genreFrequency.get(id) ?? 0) + 1)
    }
  }

  // 7. Take top 5 genres by frequency (with their frequencies for weighted search)
  const topGenreEntries = [...genreFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topGenres = topGenreEntries.map(([id]) => id)

  // A1. Weighted genre search counts: dominant genres get more results.
  // limit = clamp(round(50 * freq / totalFreq), 20, 80)
  const totalFreq = topGenreEntries.reduce((sum, [, freq]) => sum + freq, 0)

  // 8. Search by genre — popular podcasts in each genre, no name bias.
  //    Each genre gets a weighted limit proportional to its frequency.
  const genreResults = await Promise.all(
    topGenreEntries.map(([genreId, freq]) => {
      const weightedLimit = totalFreq > 0
        ? Math.max(20, Math.min(80, Math.round(50 * (freq / totalFreq))))
        : 50
      return fetch(
        `https://itunes.apple.com/search?term=podcast&genreId=${genreId}&media=podcast&limit=${weightedLimit}`,
        { next: { revalidate: 86400 } }
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => (d.results ?? []) as ItunesResult[])
    })
  )

  // A2. Serendipity genre slot: 1 random genre NOT already in topGenres, limit=20.
  const topGenreSet = new Set(topGenres)
  const serendipityCandidates = [...genreFrequency.keys()].filter((id) => !topGenreSet.has(id))
  let serendipityResults: ItunesResult[] = []
  if (serendipityCandidates.length > 0) {
    const serendipityGenre = serendipityCandidates[
      Math.floor(Math.random() * serendipityCandidates.length)
    ]
    serendipityResults = await fetch(
      `https://itunes.apple.com/search?term=podcast&genreId=${serendipityGenre}&media=podcast&limit=20`,
      { next: { revalidate: 86400 } }
    )
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => (d.results ?? []) as ItunesResult[])
  }

  // 9. Shuffle all results so order varies per visit.
  //    Serendipity results are appended after main results (lower priority before shuffle).
  const shuffle = <T,>(arr: T[]): T[] => arr.sort(() => Math.random() - 0.5)
  const allResults = shuffle([...genreResults.flat(), ...serendipityResults])

  // 10. Deduplicate by collectionId (first occurrence wins)
  const seen = new Set<number>()
  const merged: ItunesResult[] = []
  for (const result of allResults) {
    if (!seen.has(result.collectionId)) {
      seen.add(result.collectionId)
      merged.push(result)
    }
  }

  // 11. Filter out results missing feedUrl
  // 12. Filter out subscribed feed URLs
  // A3. Filter out low-episode-count podcasts (< 5 episodes); keep results where trackCount is missing
  const filtered = merged
    .filter((r) => r.feedUrl)
    .filter((r) => !subscribedFeedUrls.has(r.feedUrl))
    .filter((r) => !r.trackCount || r.trackCount >= 5)

  // 13. Return first 36 (client paginates in batches of 12)
  const results = filtered.slice(0, 36)

  const debug = isDev ? {
    seeds: seeds.map((s) => ({ title: s.title, seconds: listenMap.get(s.feed_url) ?? 0, pinned: top2.includes(s) })),
    topGenres,
    topGenreEntries: topGenreEntries.map(([id, freq]) => ({
      genreId: id,
      freq,
      weightedLimit: totalFreq > 0 ? Math.max(20, Math.min(80, Math.round(50 * (freq / totalFreq)))) : 50,
    })),
    serendipityCandidateCount: serendipityCandidates.length,
    genreFrequency: Object.fromEntries(genreFrequency),
    rawTotal: allResults.length,
    filtering: {
      mergedTotal: merged.length,
      removedMissingFeedUrl: merged.length - merged.filter((r) => r.feedUrl).length,
      removedBySubscription: merged.filter((r) => r.feedUrl).length - merged.filter((r) => r.feedUrl).filter((r) => !subscribedFeedUrls.has(r.feedUrl)).length,
      removedLowEpisodeCount: merged.filter((r) => r.feedUrl).filter((r) => !subscribedFeedUrls.has(r.feedUrl)).length - filtered.length,
      remaining: filtered.length,
    },
  } : undefined

  return NextResponse.json({ results, ...(debug ? { debug } : {}) })
}
