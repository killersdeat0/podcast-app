import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const guid = searchParams.get('guid')
  const feedUrl = searchParams.get('feedUrl')

  if (!guid || !feedUrl) return NextResponse.json({ positionSeconds: 0 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ positionSeconds: 0 })

  const { data } = await supabase
    .from('playback_progress')
    .select('position_seconds, completed')
    .eq('user_id', user.id)
    .eq('episode_guid', guid)
    .single()

  return NextResponse.json({
    positionSeconds: data?.completed ? 0 : (data?.position_seconds ?? 0),
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guid, feedUrl, positionSeconds, positionPct, completed, title, audioUrl, duration, artworkUrl, podcastTitle } =
    await request.json()

  // Upsert episode metadata so history can display it
  if (title && audioUrl) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('artwork_url')
      .eq('user_id', user.id)
      .eq('feed_url', feedUrl)
      .maybeSingle()

    await supabase.from('episodes').upsert({
      feed_url: feedUrl,
      guid,
      title,
      audio_url: audioUrl,
      duration: duration ?? null,
      artwork_url: sub?.artwork_url || artworkUrl || null,
      podcast_title: podcastTitle ?? null,
    }, { onConflict: 'feed_url,guid' })
  }

  // Fetch previous progress before upserting, so we can compute stats.
  // We use updated_at (not position delta) to measure listening time — see docs/data-model.md.
  const { data: prevProgress } = await supabase
    .from('playback_progress')
    .select('completed, updated_at')
    .eq('user_id', user.id)
    .eq('episode_guid', guid)
    .maybeSingle()

  const prevCompleted: boolean = prevProgress?.completed ?? false

  // Cap position to duration to prevent >100% progress from RSS metadata mismatches.
  // When marking completed, keep the actual audio position (may slightly exceed RSS duration).
  const safePosition = (!completed && duration && positionSeconds > duration)
    ? duration
    : positionSeconds

  const { error } = await supabase.from('playback_progress').upsert({
    user_id: user.id,
    episode_guid: guid,
    feed_url: feedUrl,
    position_seconds: safePosition,
    position_pct: positionPct ?? null,
    completed: completed ?? false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,episode_guid' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // --- Stats upserts ---
  // Measure real time elapsed since the last save (not position delta) so that
  // skipping and speed changes don't inflate stats. Saves only fire while audio
  // is playing, so timeSinceLastSave ≈ actual listening time. Cap at 15s to
  // absorb timing jitter on pause/resume.
  const STATS_CAP_SECONDS = 15
  const timeSinceLastSave = prevProgress?.updated_at
    ? Math.floor((Date.now() - new Date(prevProgress.updated_at).getTime()) / 1000)
    : 0
  const secondsListened = Math.min(timeSinceLastSave, STATS_CAP_SECONDS)
  const isNewCompletion = (completed === true) && (prevCompleted === false)

  if (secondsListened > 0) {
    // listening_daily: increment seconds_listened for today (UTC)
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    const { data: dailyRow } = await supabase
      .from('listening_daily')
      .select('seconds_listened')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle()

    await supabase.from('listening_daily').upsert({
      user_id: user.id,
      date: today,
      seconds_listened: (dailyRow?.seconds_listened ?? 0) + secondsListened,
    }, { onConflict: 'user_id,date' })

    // listening_by_show: increment seconds_listened and update last_listened_at
    const { data: showRow } = await supabase
      .from('listening_by_show')
      .select('seconds_listened, episodes_completed')
      .eq('user_id', user.id)
      .eq('feed_url', feedUrl)
      .maybeSingle()

    await supabase.from('listening_by_show').upsert({
      user_id: user.id,
      feed_url: feedUrl,
      seconds_listened: (showRow?.seconds_listened ?? 0) + secondsListened,
      episodes_completed: (showRow?.episodes_completed ?? 0) + (isNewCompletion ? 1 : 0),
      last_listened_at: new Date().toISOString(),
    }, { onConflict: 'user_id,feed_url' })
  } else if (isNewCompletion) {
    // Delta is 0 or negative (e.g. user scrubbed back) but this is still a new completion
    // — increment episodes_completed only
    const { data: showRow } = await supabase
      .from('listening_by_show')
      .select('seconds_listened, episodes_completed')
      .eq('user_id', user.id)
      .eq('feed_url', feedUrl)
      .maybeSingle()

    await supabase.from('listening_by_show').upsert({
      user_id: user.id,
      feed_url: feedUrl,
      seconds_listened: showRow?.seconds_listened ?? 0,
      episodes_completed: (showRow?.episodes_completed ?? 0) + 1,
      last_listened_at: new Date().toISOString(),
    }, { onConflict: 'user_id,feed_url' })
  }

  return NextResponse.json({ ok: true })
}
