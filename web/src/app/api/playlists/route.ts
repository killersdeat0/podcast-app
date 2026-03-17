import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: playlists, error } = await supabase
    .from('playlists')
    .select('*, playlist_episodes(count)')
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (playlists ?? []).map((p) => ({
    ...p,
    episode_count: (p.playlist_episodes as unknown as [{ count: number }])[0]?.count ?? 0,
    playlist_episodes: undefined,
  }))

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description } = await request.json()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', user.id)
    .single()

  if (!profile || profile.tier === 'free') {
    const { count } = await supabase
      .from('playlists')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Playlist limit reached. Upgrade to create more playlists.' },
        { status: 403 }
      )
    }
  }

  const { data: maxRow } = await supabase
    .from('playlists')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (maxRow?.position ?? 0) + 1

  const { data: playlist, error } = await supabase
    .from('playlists')
    .insert({ user_id: user.id, name, description: description ?? null, is_public: false, position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, playlist })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderedIds }: { orderedIds: string[] } = await request.json()

  await Promise.all(
    orderedIds.map((id, position) =>
      supabase
        .from('playlists')
        .update({ position })
        .eq('user_id', user.id)
        .eq('id', id)
    )
  )

  return NextResponse.json({ ok: true })
}
