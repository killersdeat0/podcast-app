import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseFeed } from '@/lib/rss/parser'

const STALE_MS = 60 * 60 * 1000 // 1 hour
const BATCH_SIZE = 10

interface SubscriptionRow {
  feed_url: string
  last_visited_at: string | null
  last_feed_checked_at: string | null
  episode_filter: string | null
}

function computeNewEpisodeCount(
  episodes: Array<{ pubDate: string; title: string }>,
  lastVisitedAt: string | null,
  episodeFilter: string | null,
  tier: string,
): number {
  const baseEps = lastVisitedAt
    ? episodes.filter((ep) => new Date(ep.pubDate) > new Date(lastVisitedAt))
    : episodes

  if (tier !== 'paid') {
    // Free: '' = opted out, otherwise all new
    return episodeFilter === '' ? 0 : baseEps.length
  }
  // Paid
  if (!episodeFilter) return 0                       // no setting: no notifications
  if (episodeFilter === '*') return baseEps.length   // all episodes
  const f = episodeFilter.toLowerCase()
  return baseEps.filter((ep) => ep.title.toLowerCase().includes(f)).length
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: subs }, { data: profile }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('feed_url, last_visited_at, last_feed_checked_at, episode_filter')
      .eq('user_id', user.id),
    supabase
      .from('user_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!subs) return NextResponse.json({ error: 'Failed to load subscriptions' }, { status: 500 })

  const tier = profile?.tier ?? 'free'
  const now = Date.now()

  const stale = (subs as SubscriptionRow[]).filter((sub) => {
    if (!sub.last_feed_checked_at) return true
    return now - new Date(sub.last_feed_checked_at).getTime() >= STALE_MS
  })

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (sub) => {
        const feed = await parseFeed(sub.feed_url)
        if (!feed) return

        const latestPubDate = feed.episodes.length > 0
          ? feed.episodes.reduce((latest, ep) =>
              new Date(ep.pubDate) > new Date(latest) ? ep.pubDate : latest,
              feed.episodes[0].pubDate,
            )
          : null

        const newEpisodeCount = computeNewEpisodeCount(
          feed.episodes,
          sub.last_visited_at,
          sub.episode_filter,
          tier,
        )

        await supabase
          .from('subscriptions')
          .update({
            latest_episode_pub_date: latestPubDate,
            new_episode_count: newEpisodeCount,
            last_feed_checked_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('feed_url', sub.feed_url)
      }),
    )
  }

  const { data: updated, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscriptions: updated })
}
