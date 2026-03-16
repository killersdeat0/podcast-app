import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const feedUrl = searchParams.get('feedUrl')
  const since = searchParams.get('since')

  if (!feedUrl || !since) {
    return NextResponse.json({ error: 'feedUrl and since are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('episodes')
    .select('guid, title, audio_url, pub_date, duration, artwork_url, chapter_url')
    .eq('feed_url', feedUrl)
    .gt('pub_date', since)
    .order('pub_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
