import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [profileResult, listeningResult, completedResult, streakResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('tier, default_volume, skip_back_seconds, skip_forward_seconds, theme')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('listening_daily')
      .select('seconds_listened')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo),
    supabase
      .from('playback_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('updated_at', sevenDaysAgo),
    supabase
      .from('listening_daily')
      .select('date')
      .eq('user_id', user.id)
      .gt('seconds_listened', 0)
      .order('date', { ascending: false }),
  ])

  const tier = profileResult.data?.tier ?? 'free'
  const listeningSeconds = (listeningResult.data ?? []).reduce(
    (sum, row) => sum + (row.seconds_listened ?? 0),
    0,
  )
  const completedThisWeek = (completedResult.data ?? []).length

  // Calculate streak: consecutive days with listening activity ending today or yesterday
  const days = new Set(
    (streakResult.data ?? []).map((r) => r.date as string)
  )
  let streakDays = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from today; if no activity today, start from yesterday
  const cursor = new Date(today)
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streakDays++
    cursor.setDate(cursor.getDate() - 1)
  }

  const defaultVolume = profileResult.data?.default_volume ?? null
  const skipBackSeconds = profileResult.data?.skip_back_seconds ?? null
  const skipForwardSeconds = profileResult.data?.skip_forward_seconds ?? null
  const theme = profileResult.data?.theme ?? 'rose'
  return NextResponse.json({ email: user.email, tier, listeningSeconds, completedThisWeek, streakDays, defaultVolume, skipBackSeconds, skipForwardSeconds, theme })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const update: Record<string, number | string | null> = {}

  if (body.defaultVolume !== undefined) {
    const v = Number(body.defaultVolume)
    update.default_volume = isNaN(v) ? null : Math.max(0, Math.min(1, v))
  }

  if (body.skipBackSeconds !== undefined) {
    const v = Number(body.skipBackSeconds)
    update.skip_back_seconds = isNaN(v) ? null : Math.max(1, v)
  }

  if (body.skipForwardSeconds !== undefined) {
    const v = Number(body.skipForwardSeconds)
    update.skip_forward_seconds = isNaN(v) ? null : Math.max(1, v)
  }

  const VALID_THEMES = ['rose', 'amber', 'sky', 'violet'] as const
  if (body.theme !== undefined) {
    if (!VALID_THEMES.includes(body.theme)) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    }
    update.theme = body.theme
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(update)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
