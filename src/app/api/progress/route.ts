import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const guid = searchParams.get('guid')
  const feedUrl = searchParams.get('feedUrl')

  if (!guid || !feedUrl) return NextResponse.json({ positionSeconds: 0 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ positionSeconds: 0 })

  const { data } = await supabase
    .from('playback_progress')
    .select('position_seconds')
    .eq('user_id', user.id)
    .eq('episode_guid', guid)
    .single()

  return NextResponse.json({ positionSeconds: data?.position_seconds ?? 0 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guid, feedUrl, positionSeconds, completed, title, audioUrl, duration, artworkUrl, podcastTitle } =
    await request.json()

  // Upsert episode metadata so history can display it
  if (title && audioUrl) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('artwork_url')
      .eq('user_id', user.id)
      .eq('feed_url', feedUrl)
      .maybeSingle()

    await supabase.from('episodes').upsert({
      feed_url: feedUrl,
      guid,
      title,
      audio_url: audioUrl,
      duration: duration ?? null,
      artwork_url: sub?.artwork_url || artworkUrl || null,
      podcast_title: podcastTitle ?? null,
    }, { onConflict: 'feed_url,guid' })
  }

  const { error } = await supabase.from('playback_progress').upsert({
    user_id: user.id,
    episode_guid: guid,
    feed_url: feedUrl,
    position_seconds: positionSeconds,
    completed: completed ?? false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,episode_guid' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
