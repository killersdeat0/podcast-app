import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('subscriptions')
    .update({ last_visited_at: sevenDaysAgo, new_episode_count: 0, last_feed_checked_at: null })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
