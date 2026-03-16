import { NextRequest, NextResponse } from 'next/server'

interface ItunesEpisode {
  wrapperType: string
  trackId: number
  episodeGuid?: string
  trackName: string
  releaseDate: string
  trackTimeMillis: number
  episodeUrl: string
  description?: string
}

export async function GET(request: NextRequest) {
  const collectionId = request.nextUrl.searchParams.get('collectionId')
  if (!collectionId) return NextResponse.json({ error: 'collectionId required' }, { status: 400 })

  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=200`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return NextResponse.json({ error: 'iTunes lookup failed' }, { status: 502 })

  const data = await res.json()
  const episodes: ItunesEpisode[] = (data.results ?? []).filter(
    (r: ItunesEpisode) => r.wrapperType === 'podcastEpisode'
  )

  return NextResponse.json(episodes)
}
