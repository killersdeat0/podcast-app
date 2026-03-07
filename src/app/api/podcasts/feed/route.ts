import { NextRequest, NextResponse } from 'next/server'
import { parseFeed } from '@/lib/rss/parser'

export async function GET(req: NextRequest) {
  const feedUrl = req.nextUrl.searchParams.get('url')
  if (!feedUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  const feed = await parseFeed(feedUrl)
  if (!feed) return NextResponse.json({ error: 'Failed to parse feed' }, { status: 502 })
  return NextResponse.json(feed)
}
