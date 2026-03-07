import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: progress, error } = await supabase
    .from('playback_progress')
    .select('episode_guid, feed_url, position_seconds, completed, updated_at')
    .eq('user_id', user.id)
    .gt('position_seconds', 0)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!progress || progress.length === 0) return NextResponse.json([])

  const guids = progress.map((p) => p.episode_guid)
  const feedUrls = [...new Set(progress.map((p) => p.feed_url))]

  const [{ data: episodes }, { data: subscriptions }] = await Promise.all([
    supabase
      .from('episodes')
      .select('guid, feed_url, title, audio_url, duration, artwork_url, podcast_title')
      .in('guid', guids),
    supabase
      .from('subscriptions')
      .select('feed_url, artwork_url')
      .in('feed_url', feedUrls),
  ])

  const subArtworkMap = new Map((subscriptions ?? []).map((s) => [s.feed_url, s.artwork_url]))
  const episodeMap = new Map((episodes ?? []).map((e) => [e.guid, e]))

  const result = progress.map((p) => {
    const ep = episodeMap.get(p.episode_guid) ?? null
    return {
      ...p,
      episode: ep
        ? { ...ep, artwork_url: subArtworkMap.get(p.feed_url) || ep.artwork_url || null }
        : null,
    }
  })

  return NextResponse.json(result)
}
