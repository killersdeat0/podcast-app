import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Body A: reorder subscriptions
  if (body.orderedFeedUrls) {
    const { orderedFeedUrls }: { orderedFeedUrls: string[] } = body
    await Promise.all(
      orderedFeedUrls.map((feedUrl, position) =>
        supabase
          .from('subscriptions')
          .update({ position })
          .eq('user_id', user.id)
          .eq('feed_url', feedUrl)
      )
    )
    return NextResponse.json({ ok: true })
  }

  // Body B: update visit tracking / episode filter
  if (body.feedUrl) {
    const update: Record<string, string | number | null> = {}
    if (body.latestEpisodePubDate !== undefined) update.latest_episode_pub_date = body.latestEpisodePubDate
    if (body.lastVisitedAt !== undefined) update.last_visited_at = body.lastVisitedAt
    if (body.newEpisodeCount !== undefined) update.new_episode_count = body.newEpisodeCount
    if (body.episodeFilter !== undefined) {
      const isSentinel = body.episodeFilter === '' || body.episodeFilter === '*'
      if (isSentinel) {
        // All users can toggle all/off
        update.episode_filter = body.episodeFilter
      } else {
        // Custom text filter: paid only
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tier')
          .eq('user_id', user.id)
          .single()
        if (profile?.tier === 'paid') update.episode_filter = body.episodeFilter
      }
    }
    if (Object.keys(update).length > 0) {
      await supabase
        .from('subscriptions')
        .update(update)
        .eq('user_id', user.id)
        .eq('feed_url', body.feedUrl)
    }

    // Cache new episode metadata so they remain visible even after aging out of the RSS feed
    if (Array.isArray(body.newEpisodesToCache) && body.newEpisodesToCache.length > 0) {
      const rows = (body.newEpisodesToCache as Array<{
        guid: string; title: string; audioUrl: string; pubDate: string;
        duration: number | null; artworkUrl: string; podcastTitle: string;
      }>).map((ep) => ({
        feed_url: body.feedUrl as string,
        guid: ep.guid,
        title: ep.title,
        audio_url: ep.audioUrl,
        pub_date: ep.pubDate,
        duration: ep.duration,
        artwork_url: ep.artworkUrl,
        podcast_title: ep.podcastTitle,
      }))
      await supabase.from('episodes').upsert(rows, { onConflict: 'feed_url,guid' })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { feedUrl, title, artworkUrl, collectionId } = await request.json()

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: user.id,
      feed_url: feedUrl,
      title,
      artwork_url: artworkUrl,
      collection_id: collectionId ?? null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { feedUrl } = await request.json()

  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('feed_url', feedUrl)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
