import { createClient } from '@/lib/supabase/server'
import { verifyPlaylistOwnership } from '@/lib/playlists/verifyOwnership'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // RLS allows: owner full access, authenticated users can read is_public=true,
  // anon role can read is_public=true (policy added in 20260316000000_playlists_anon_rls.sql).
  // Private playlists return no row for non-owners → 404.
  const { data: playlist, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !playlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = !!user && playlist.user_id === user.id

  const { data: playlistEpisodes } = await supabase
    .from('playlist_episodes')
    .select('*')
    .eq('playlist_id', id)
    .order('position', { ascending: true })

  const guids = (playlistEpisodes ?? []).map((pe) => pe.episode_guid)
  const feedUrls = [...new Set((playlistEpisodes ?? []).map((pe) => pe.feed_url))]

  const [{ data: episodeRows }, { data: subscriptions }, { data: progressRows }] = await Promise.all([
    guids.length > 0
      ? supabase.from('episodes').select('guid, feed_url, title, audio_url, duration, artwork_url, podcast_title, pub_date, description').in('guid', guids)
      : { data: [] },
    feedUrls.length > 0 && user
      ? supabase.from('subscriptions').select('feed_url, artwork_url').in('feed_url', feedUrls)
      : { data: [] },
    guids.length > 0 && user
      ? supabase.from('playback_progress').select('episode_guid, position_seconds, completed').eq('user_id', user.id).in('episode_guid', guids)
      : { data: [] },
  ])

  const episodeMap = new Map((episodeRows ?? []).map((e) => [e.guid, e]))
  const subArtworkMap = new Map((subscriptions ?? []).map((s) => [s.feed_url, s.artwork_url]))
  const progressMap = new Map((progressRows ?? []).map((p) => [p.episode_guid, p]))

  const episodes = (playlistEpisodes ?? []).map((pe) => {
    const ep = episodeMap.get(pe.episode_guid) ?? null
    const prog = progressMap.get(pe.episode_guid)
    return {
      ...pe,
      episode: ep ? { ...ep, artwork_url: subArtworkMap.get(pe.feed_url) || ep.artwork_url || null } : null,
      position_seconds: prog?.position_seconds ?? 0,
      completed: prog?.completed ?? false,
    }
  })

  return NextResponse.json({ playlist, episodes, isOwner })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwner = await verifyPlaylistOwnership(id, user.id)
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.isPublic !== undefined) updates.is_public = body.isPublic

  const { data: playlist, error } = await supabase
    .from('playlists')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, playlist })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwner = await verifyPlaylistOwnership(id, user.id)
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('playlists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
