import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profileResult, listeningResult] = await Promise.all([
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
  ])

  const tier = profileResult.data?.tier ?? 'free'
  const listeningSeconds = (listeningResult.data ?? []).reduce(
    (sum, row) => sum + (row.position_seconds ?? 0),
    0,
  )

  return NextResponse.json({ email: user.email, tier, listeningSeconds })
}
