import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const feedUrl = req.nextUrl.searchParams.get('url')
  if (!feedUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const nocache = req.nextUrl.searchParams.get('nocache') === '1'
  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : null

  const res = await fetch(
    `${supabaseUrl}/functions/v1/podcasts-feed?url=${encodeURIComponent(feedUrl)}`,
    {
      headers: { Authorization: `Bearer ${supabaseKey}` },
      ...(nocache ? { cache: 'no-store' } : { next: { revalidate: 3600 } }),
    }
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to parse feed' }, { status: 502 })
  const feed = await res.json()

  const total = Array.isArray(feed.episodes) ? feed.episodes.length : 0
  if (limit && limit > 0 && Array.isArray(feed.episodes) && feed.episodes.length > limit) {
    return NextResponse.json({ ...feed, episodes: feed.episodes.slice(0, limit), total })
  }
  return NextResponse.json({ ...feed, total })
}
