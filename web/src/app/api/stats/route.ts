import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profileResult = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('user_id', user.id)
    .single()

  const tier = (profileResult.data?.tier ?? 'free') as 'free' | 'paid'

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let dailyQuery = supabase
    .from('listening_daily')
    .select('date, seconds_listened')
    .eq('user_id', user.id)
    .order('date', { ascending: true })

  if (tier === 'free') {
    dailyQuery = dailyQuery.gte('date', thirtyDaysAgo)
  }

  const [dailyResult, showResult, subscriptionsResult] = await Promise.all([
    dailyQuery,
    supabase
      .from('listening_by_show')
      .select('feed_url, seconds_listened, episodes_completed, last_listened_at')
      .eq('user_id', user.id)
      .order('seconds_listened', { ascending: false })
      .limit(10),
    supabase
      .from('subscriptions')
      .select('feed_url, title')
      .eq('user_id', user.id),
  ])

  const titleByFeedUrl = Object.fromEntries(
    (subscriptionsResult.data ?? []).map((s) => [s.feed_url, s.title])
  )

  // For shows not in subscriptions, fall back to episodes.podcast_title
  const unsubscribedFeedUrls = (showResult.data ?? [])
    .map((r) => r.feed_url)
    .filter((url) => !titleByFeedUrl[url])

  if (unsubscribedFeedUrls.length > 0) {
    const { data: episodeRows } = await supabase
      .from('episodes')
      .select('feed_url, podcast_title')
      .in('feed_url', unsubscribedFeedUrls)
      .not('podcast_title', 'is', null)
    for (const ep of episodeRows ?? []) {
      if (ep.podcast_title && !titleByFeedUrl[ep.feed_url]) {
        titleByFeedUrl[ep.feed_url] = ep.podcast_title
      }
    }
  }

  const dailyRows = (dailyResult.data ?? []).map((r) => ({
    date: r.date as string,
    secondsListened: r.seconds_listened as number,
  }))

  const showRows = (showResult.data ?? []).map((r) => ({
    feedUrl: r.feed_url as string,
    title: titleByFeedUrl[r.feed_url] ?? null,
    secondsListened: r.seconds_listened as number,
    episodesCompleted: r.episodes_completed as number,
    lastListenedAt: r.last_listened_at as string,
  }))

  return NextResponse.json({ tier, dailyRows, showRows })
}
