export interface ItunesResult {
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl600: string
  feedUrl: string
  trackCount: number
  primaryGenreName: string
}

export async function searchPodcasts(term: string): Promise<ItunesResult[]> {
  const url = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=20`
  const res = await fetch(url, {
    next: { revalidate: 3600 } // Cache for 1 hour
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}
