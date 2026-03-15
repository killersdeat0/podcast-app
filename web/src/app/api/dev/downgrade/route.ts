import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('user_profiles')
    .update({ tier: 'free', stripe_subscription_id: null })
    .eq('user_id', user.id)

  // Reset any custom text episode filters back to '*' (all episodes)
  // Free users can't have custom filters, but can keep all/off sentinels
  await supabase
    .from('subscriptions')
    .update({ episode_filter: '*' })
    .eq('user_id', user.id)
    .not('episode_filter', 'is', null)
    .neq('episode_filter', '')
    .neq('episode_filter', '*')

  return NextResponse.json({ ok: true })
}
