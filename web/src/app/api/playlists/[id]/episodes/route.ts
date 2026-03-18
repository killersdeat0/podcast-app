import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { LIMITS } from '@/lib/limits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: playlist } = await supabase.from('playlists').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!playlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { guid, feedUrl, title, audioUrl, artworkUrl, podcastTitle, duration, pubDate, description } =
    await request.json()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', user.id)
    .single()

  const episodeLimit = (!profile || profile.tier === 'free') ? LIMITS.free.playlistEpisodes : LIMITS.paid.playlistEpisodes

  // Check if episode already exists — if so, skip the count check (upsert is a no-op)
  const { data: existing } = await supabase
    .from('playlist_episodes')
    .select('id')
    .eq('playlist_id', id)
    .eq('episode_guid', guid)
    .maybeSingle()

  if (!existing) {
    const { count } = await supabase
      .from('playlist_episodes')
      .select('*', { count: 'exact', head: true })
      .eq('playlist_id', id)

    if ((count ?? 0) >= episodeLimit) {
      return NextResponse.json(
        { error: 'Episode limit reached. Upgrade for unlimited episodes per playlist.' },
        { status: 403 }
      )
    }
  }

  // Subscription artwork priority
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

  const { data: maxRow } = await supabase
    .from('playlist_episodes')
    .select('position')
    .eq('playlist_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (maxRow?.position ?? 0) + 1

  const { error } = await supabase
    .from('playlist_episodes')
    .upsert(
      { playlist_id: id, episode_guid: guid, feed_url: feedUrl, position },
      { onConflict: 'playlist_id,episode_guid' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: playlist } = await supabase.from('playlists').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!playlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { guid } = await request.json()

  const { error } = await supabase
    .from('playlist_episodes')
    .delete()
    .eq('playlist_id', id)
    .eq('episode_guid', guid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: playlist } = await supabase.from('playlists').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!playlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { orderedGuids }: { orderedGuids: string[] } = await request.json()

  await Promise.all(
    orderedGuids.map((guid, position) =>
      supabase
        .from('playlist_episodes')
        .update({ position })
        .eq('playlist_id', id)
        .eq('episode_guid', guid)
    )
  )

  return NextResponse.json({ ok: true })
}
