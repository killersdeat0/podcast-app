import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderedGuids }: { orderedGuids: string[] } = await request.json()

  await Promise.all(
    orderedGuids.map((guid, position) =>
      supabase
        .from('queue')
        .update({ position })
        .eq('user_id', user.id)
        .eq('episode_guid', guid)
    )
  )

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: queue, error } = await supabase
    .from('queue')
    .select('episode_guid, feed_url, position')
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!queue || queue.length === 0) return NextResponse.json([])

  const guids = queue.map((q) => q.episode_guid)
  const feedUrls = [...new Set(queue.map((q) => q.feed_url))]

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

  const result = queue.map((q) => {
    const ep = episodeMap.get(q.episode_guid) ?? null
    return {
      ...q,
      episode: ep
        ? { ...ep, artwork_url: subArtworkMap.get(q.feed_url) || ep.artwork_url || null }
        : null,
    }
  })

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guid, feedUrl, title, audioUrl, artworkUrl, podcastTitle, duration, pubDate, description } =
    await request.json()

  // Upsert episode metadata
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
    pub_date: pubDate ?? null,
    description: description ?? null,
    artwork_url: sub?.artwork_url || artworkUrl || null,
    podcast_title: podcastTitle ?? null,
  }, { onConflict: 'feed_url,guid' })

  // Get next position
  const { data: maxRow } = await supabase
    .from('queue')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (maxRow?.position ?? 0) + 1

  const { error } = await supabase
    .from('queue')
    .upsert({ user_id: user.id, episode_guid: guid, feed_url: feedUrl, position }, { onConflict: 'user_id,episode_guid' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guid } = await request.json()

  const { error } = await supabase
    .from('queue')
    .delete()
    .eq('user_id', user.id)
    .eq('episode_guid', guid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
