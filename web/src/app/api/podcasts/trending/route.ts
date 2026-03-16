import { NextRequest, NextResponse } from 'next/server'
import { fetchTopPodcasts, fetchPodcastsByGenre } from '@/lib/itunes/trending'

export async function GET(req: NextRequest) {
  const genreId = req.nextUrl.searchParams.get('genreId')

  const results =
    genreId && Number(genreId) > 0
      ? await fetchPodcastsByGenre(Number(genreId))
      : await fetchTopPodcasts()

  return NextResponse.json({ results })
}
