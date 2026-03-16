import type { ItunesResult } from './search'

interface AppleTopChartItem {
  id: string
  name: string
  artistName: string
  artworkUrl100: string
  genres: Array<{ genreId: string; name: string; url: string }>
  url: string
}

interface AppleTopChartFeed {
  feed: {
    results: AppleTopChartItem[]
  }
}

export const PODCAST_GENRES = [
  { id: 0, label: 'All' },
  { id: 1303, label: 'Comedy' },
  { id: 1318, label: 'Technology' },
  { id: 1489, label: 'News' },
  { id: 1488, label: 'True Crime' },
  { id: 1321, label: 'Business' },
  { id: 1304, label: 'Education' },
  { id: 1324, label: 'Society & Culture' },
  { id: 1545, label: 'Sports' },
  { id: 1512, label: 'Health & Fitness' },
] as const

/**
 * Fetch top podcasts from Apple's top charts, then enrich via iTunes lookup
 * to get full ItunesResult-compatible data (feedUrl, artwork600, etc.).
 */
export async function fetchTopPodcasts(limit = 25): Promise<ItunesResult[]> {
  const chartRes = await fetch(
    `https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/${limit}/podcasts.json`,
    { next: { revalidate: 3600 } }
  )
  if (!chartRes.ok) return []

  const chart: AppleTopChartFeed = await chartRes.json()
  const ids = chart.feed.results.map((r) => r.id).join(',')
  if (!ids) return []

  const lookupRes = await fetch(
    `https://itunes.apple.com/lookup?id=${ids}&entity=podcast`,
    { next: { revalidate: 3600 } }
  )
  if (!lookupRes.ok) return []

  const lookupData = await lookupRes.json()
  return (lookupData.results ?? []).filter(
    (r: Record<string, unknown>) => r.feedUrl && r.collectionName
  )
}

/**
 * Fetch popular podcasts by genre using the iTunes Search API.
 * Apple's top charts RSS feed does not support genre filtering.
 */
export async function fetchPodcastsByGenre(
  genreId: number,
  limit = 25
): Promise<ItunesResult[]> {
  // iTunes Search API requires a term — use "podcast" as a broad term and
  // filter by genreId to get popular results within the genre.
  const res = await fetch(
    `https://itunes.apple.com/search?media=podcast&term=podcast&genreId=${genreId}&limit=${limit}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}
