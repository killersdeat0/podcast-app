import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profileResult, listeningResult, completedResult, streakResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('playback_progress')
      .select('position_seconds')
      .eq('user_id', user.id)
      .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('playback_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('completed', true)
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('playback_progress')
      .select('updated_at')
      .eq('user_id', user.id)
      .gt('position_seconds', 0)
      .order('updated_at', { ascending: false }),
  ])

  const tier = profileResult.data?.tier ?? 'free'
  const listeningSeconds = (listeningResult.data ?? []).reduce(
    (sum, row) => sum + (row.position_seconds ?? 0),
    0,
  )
  const completedThisWeek = (completedResult.data ?? []).length

  // Calculate streak: consecutive days with listening activity ending today or yesterday
  const days = new Set(
    (streakResult.data ?? []).map((r) =>
      new Date(r.updated_at).toISOString().slice(0, 10)
    )
  )
  let streakDays = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from today; if no activity today, start from yesterday
  let cursor = new Date(today)
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streakDays++
    cursor.setDate(cursor.getDate() - 1)
  }

  return NextResponse.json({ email: user.email, tier, listeningSeconds, completedThisWeek, streakDays })
}
