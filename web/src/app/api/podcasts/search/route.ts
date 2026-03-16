import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get('q')
  if (!term) return NextResponse.json({ results: [] })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ results: [] })
  }

  const res = await fetch(
    `${supabaseUrl}/functions/v1/podcasts-search?q=${encodeURIComponent(term)}`,
    { headers: { Authorization: `Bearer ${supabaseKey}` } }
  )
  if (!res.ok) return NextResponse.json({ results: [] })
  const data = await res.json()
  return NextResponse.json({ results: data.results ?? [] })
}
