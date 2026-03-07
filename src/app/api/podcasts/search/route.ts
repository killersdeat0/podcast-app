import { NextRequest, NextResponse } from 'next/server'
import { searchPodcasts } from '@/lib/itunes/search'

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('q')
  if (!term) return NextResponse.json({ results: [] })
  const results = await searchPodcasts(term)
  return NextResponse.json({ results })
}
