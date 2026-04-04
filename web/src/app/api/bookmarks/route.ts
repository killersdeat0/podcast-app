import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const feedUrl = searchParams.get('feedUrl')
  const guid = searchParams.get('guid')

  // All-bookmarks mode: no feedUrl/guid — return all with episode metadata
  if (!feedUrl || !guid) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, feed_url, episode_guid, position_seconds, note, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    // Fetch episode metadata for unique (feed_url, guid) pairs
    const pairs = [...new Map(rows.map((b) => [`${b.feed_url}|${b.episode_guid}`, { feedUrl: b.feed_url, guid: b.episode_guid }])).values()]
    const episodeMap: Record<string, { title: string; podcastTitle: string; artworkUrl: string | null; audioUrl: string; duration: number | null }> = {}
    if (pairs.length > 0) {
      const guids = pairs.map((p) => p.guid)
      const { data: episodes } = await supabase
        .from('episodes')
        .select('guid, feed_url, title, podcast_title, artwork_url, audio_url, duration')
        .in('guid', guids)
      for (const ep of episodes ?? []) {
        episodeMap[`${ep.feed_url}|${ep.guid}`] = {
          title: ep.title,
          podcastTitle: ep.podcast_title,
          artworkUrl: ep.artwork_url ?? null,
          audioUrl: ep.audio_url,
          duration: ep.duration ?? null,
        }
      }
    }

    return NextResponse.json(rows.map((b) => ({
      id: b.id,
      feedUrl: b.feed_url,
      guid: b.episode_guid,
      positionSeconds: b.position_seconds,
      note: b.note ?? null,
      createdAt: b.created_at,
      episode: episodeMap[`${b.feed_url}|${b.episode_guid}`] ?? null,
    })))
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .select('id, position_seconds, note, created_at')
    .eq('user_id', user.id)
    .eq('feed_url', feedUrl)
    .eq('episode_guid', guid)
    .order('position_seconds', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bookmarks = (data ?? []).map((b) => ({
    id: b.id,
    positionSeconds: b.position_seconds,
    note: b.note ?? null,
    createdAt: b.created_at,
  }))

  return NextResponse.json(bookmarks)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { feedUrl, guid, positionSeconds, note } = body as {
    feedUrl: string
    guid: string
    positionSeconds: number
    note?: string
  }

  if (!feedUrl || !guid || positionSeconds == null) {
    return NextResponse.json({ error: 'feedUrl, guid, and positionSeconds are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      feed_url: feedUrl,
      episode_guid: guid,
      position_seconds: Math.floor(positionSeconds),
      note: note ?? null,
    })
    .select('id, position_seconds, note, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id: data.id,
    positionSeconds: data.position_seconds,
    note: data.note ?? null,
    createdAt: data.created_at,
  })
}
