import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const feedUrl = searchParams.get('feedUrl')

  if (!feedUrl) return NextResponse.json({ progress: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ progress: [] })

  const { data } = await supabase
    .from('playback_progress')
    .select('episode_guid, position_seconds, position_pct, completed')
    .eq('user_id', user.id)
    .eq('feed_url', feedUrl)
    .gt('position_seconds', 0)

  return NextResponse.json({
    progress: (data ?? []).map((r) => ({
      guid: r.episode_guid,
      positionSeconds: r.position_seconds,
      positionPct: r.position_pct ?? null,
      completed: r.completed ?? false,
    })),
  })
}
