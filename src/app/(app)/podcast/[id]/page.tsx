'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { SkeletonEpisodeRow } from '@/components/ui/Skeleton'
import type { PodcastFeed, Episode } from '@/lib/rss/parser'

interface SubscriptionRow {
  feed_url: string
  last_visited_at: string | null
  latest_episode_pub_date: string | null
  episode_filter: string | null
}

interface ItunesEpisode {
  trackId: number
  episodeGuid?: string
  trackName: string
  releaseDate: string
  trackTimeMillis: number
  episodeUrl: string
  description?: string
}

function itunesToEpisode(ep: ItunesEpisode): Episode {
  return {
    guid: ep.episodeGuid ?? String(ep.trackId),
    title: ep.trackName,
    audioUrl: ep.episodeUrl,
    duration: ep.trackTimeMillis ? Math.round(ep.trackTimeMillis / 1000) : null,
    pubDate: ep.releaseDate,
    description: ep.description ?? '',
    chapterUrl: null,
  }
}

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function PodcastPage() {
  const params = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const feedUrl = params.get('feed') ?? ''
  const title = params.get('title') ?? ''
  const artwork = params.get('artwork') ?? ''
  const { play } = usePlayer()

  // Is `id` a numeric iTunes collection ID?
  const collectionId = /^\d+$/.test(id) ? id : null

  const [feed, setFeed] = useState<PodcastFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(new Set())
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [oldLastVisitedAt, setOldLastVisitedAt] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [episodeFilter, setEpisodeFilter] = useState('')
  const [savingFilter, setSavingFilter] = useState(false)
  const [userTier, setUserTier] = useState<'free' | 'paid' | null>(null)

  // iTunes episode search state
  const [itunesEpisodes, setItunesEpisodes] = useState<ItunesEpisode[] | null>(null)
  const [itunesLoading, setItunesLoading] = useState(false)

  useEffect(() => {
    if (!feedUrl) return
    setLoading(true)
    setError(false)
    fetch(`/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => setFeed(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [feedUrl])

  // Check subscription status + current queue + tier
  useEffect(() => {
    if (!feedUrl) return
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((subs: SubscriptionRow[]) => {
        const sub = subs.find((s) => s.feed_url === feedUrl) ?? null
        setSubscribed(!!sub)
        setSubscription(sub)
        setOldLastVisitedAt(sub?.last_visited_at ?? null)
        setEpisodeFilter(sub?.episode_filter ?? '')
      })
      .catch(() => {})
    fetch('/api/queue')
      .then((r) => r.json())
      .then((items: Array<{ episode_guid: string }>) => {
        setQueuedGuids(new Set(items.map((i) => i.episode_guid)))
      })
      .catch(() => {})
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => { if (d?.tier) setUserTier(d.tier) })
      .catch(() => {})
  }, [feedUrl])

  // Fetch iTunes episodes lazily when user starts searching
  useEffect(() => {
    if (!searchQuery || !collectionId || itunesEpisodes !== null) return
    setItunesLoading(true)
    fetch(`/api/podcasts/episodes?collectionId=${collectionId}`)
      .then((r) => r.json())
      .then((eps: ItunesEpisode[]) => setItunesEpisodes(eps))
      .catch(() => setItunesEpisodes([]))
      .finally(() => setItunesLoading(false))
  }, [searchQuery, collectionId, itunesEpisodes])

  // New episodes since last visit
  const newEpisodes = useMemo(() => {
    if (!feed) return []
    let eps = oldLastVisitedAt
      ? feed.episodes.filter((ep) => new Date(ep.pubDate) > new Date(oldLastVisitedAt))
      : feed.episodes
    if (userTier === 'paid' && subscription?.episode_filter) {
      const f = subscription.episode_filter.toLowerCase()
      eps = eps.filter((ep) => ep.title.toLowerCase().includes(f))
    }
    return eps
  }, [feed, oldLastVisitedAt, userTier, subscription])

  // Search results: iTunes episodes filtered by query (falls back to RSS if no collectionId)
  const searchResults = useMemo((): Episode[] => {
    if (!searchQuery) return []
    if (collectionId) {
      if (!itunesEpisodes) return []
      const q = searchQuery.toLowerCase()
      return itunesEpisodes
        .filter((ep) => ep.trackName?.toLowerCase().includes(q))
        .map(itunesToEpisode)
    }
    // Fallback: filter RSS episodes
    if (!feed) return []
    const q = searchQuery.toLowerCase()
    return feed.episodes.filter((ep) => ep.title.toLowerCase().includes(q))
  }, [searchQuery, collectionId, itunesEpisodes, feed])

  // On mount (after feed + subscription loaded): update latest_episode_pub_date + new_episode_count
  useEffect(() => {
    if (!feed || !feedUrl || !subscribed) return
    const newestPubDate = feed.episodes[0]?.pubDate
    if (!newestPubDate) return
    fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedUrl,
        latestEpisodePubDate: newestPubDate,
        newEpisodeCount: newEpisodes.length,
      }),
    })
    window.dispatchEvent(new Event('subscriptions-changed'))
  }, [feed, feedUrl, subscribed, newEpisodes.length])

  // On unmount: update last_visited_at + reset count
  useEffect(() => {
    if (!feedUrl || !subscribed) return
    return () => {
      fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedUrl,
          lastVisitedAt: new Date().toISOString(),
          newEpisodeCount: 0,
        }),
        keepalive: true,
      }).catch(() => {})
      window.dispatchEvent(new Event('subscriptions-changed'))
    }
  }, [feedUrl, subscribed])

  async function toggleSubscribe() {
    setSubscribing(true)
    try {
      if (subscribed) {
        await fetch('/api/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl }),
        })
        setSubscribed(false)
        setSubscription(null)
      } else {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl, title, artworkUrl: artwork, collectionId: id }),
        })
        setSubscribed(true)
      }
      window.dispatchEvent(new Event('subscriptions-changed'))
    } finally {
      setSubscribing(false)
    }
  }

  async function toggleQueue(episode: Episode) {
    const inQueue = queuedGuids.has(episode.guid)
    if (inQueue) {
      await fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid: episode.guid }),
      })
      setQueuedGuids((prev) => {
        const s = new Set(prev)
        s.delete(episode.guid)
        return s
      })
    } else {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: episode.guid,
          feedUrl,
          title: episode.title,
          audioUrl: episode.audioUrl,
          artworkUrl: artwork || feed?.artworkUrl || '',
          podcastTitle: title,
          duration: episode.duration,
          pubDate: episode.pubDate,
          description: episode.description,
        }),
      })
      setQueuedGuids((prev) => new Set([...prev, episode.guid]))
    }
  }

  function playEpisode(episode: Episode) {
    play({
      guid: episode.guid,
      feedUrl,
      title: episode.title,
      podcastTitle: title,
      artworkUrl: artwork || feed?.artworkUrl || '',
      audioUrl: episode.audioUrl,
      duration: episode.duration ?? 0,
      chapterUrl: episode.chapterUrl,
    })
  }

  async function saveEpisodeFilter() {
    setSavingFilter(true)
    await fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl, episodeFilter }),
    })
    setSubscription((prev) => prev ? { ...prev, episode_filter: episodeFilter } : prev)
    setSavingFilter(false)
  }

  async function devResetLastVisited() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl, lastVisitedAt: sevenDaysAgo }),
    })
    setOldLastVisitedAt(sevenDaysAgo)
  }

  function renderEpisodeRow(ep: Episode) {
    return (
      <div key={ep.guid} className="flex items-center gap-2">
        <button
          onClick={() => playEpisode(ep)}
          className="flex-1 text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
        >
          <p className="text-sm font-medium text-white">{ep.title}</p>
          <div className="flex gap-3 mt-1">
            <span className="text-xs text-gray-500">{new Date(ep.pubDate).toLocaleDateString()}</span>
            {ep.duration && (
              <span className="text-xs text-gray-500">{formatDuration(ep.duration)}</span>
            )}
          </div>
        </button>
        <button
          onClick={() => toggleQueue(ep)}
          title={queuedGuids.has(ep.guid) ? 'Remove from queue' : 'Add to queue'}
          className={`p-3 rounded-lg text-lg transition-colors ${
            queuedGuids.has(ep.guid)
              ? 'text-violet-400 hover:text-red-400'
              : 'text-gray-500 hover:text-white'
          }`}
        >
          {queuedGuids.has(ep.guid) ? '✓' : '+'}
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="flex gap-6 mb-8">
        {artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork} alt={title} className="w-24 h-24 md:w-32 md:h-32 rounded-xl object-cover flex-shrink-0" />
        )}
        <div className="flex flex-col justify-end gap-3 min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {feed && <p className="text-gray-400 text-sm line-clamp-3">{feed.description}</p>}
          <button
            onClick={toggleSubscribe}
            disabled={subscribing}
            className={`self-start px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              subscribed
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {subscribing ? '...' : subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
          {process.env.NODE_ENV === 'development' && subscribed && (
            <button
              onClick={devResetLastVisited}
              className="self-start text-xs text-red-400 underline"
            >
              [dev] reset last visited → 7 days ago
            </button>
          )}
        </div>
      </div>

      {/* Episode list */}
      {error ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-3">Failed to load episodes.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
        </div>
      ) : feed?.episodes.length === 0 ? (
        <p className="text-gray-400 text-sm">No episodes found.</p>
      ) : (
        <>
          {/* Search */}
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={collectionId ? 'Search all episodes via iTunes... 🔍' : 'Search episodes... 🔍'}
            className="w-full bg-gray-900 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500 mb-4"
          />

          {/* Paid: episode filter — always visible when subscribed */}
          {userTier === 'paid' && subscribed && (
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
                  New episode filter
                </label>
                <input
                  type="text"
                  value={episodeFilter}
                  onChange={(e) => setEpisodeFilter(e.target.value)}
                  placeholder="e.g. 90 Day, interview... (leave blank for all)"
                  className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button
                onClick={saveEpisodeFilter}
                disabled={savingFilter}
                className="mt-5 px-3 py-1.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {savingFilter ? '...' : 'Save'}
              </button>
            </div>
          )}

          {/* Search results */}
          {searchQuery ? (
            <div className="space-y-2">
              {itunesLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonEpisodeRow key={i} />)
              ) : searchResults.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No episodes found.</p>
              ) : (
                searchResults.map(renderEpisodeRow)
              )}
            </div>
          ) : (
            <>
              {/* New episodes section */}
              {subscribed && newEpisodes.length > 0 && (
                <section className="mb-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    New Episodes ✨
                  </h2>

                  <div className="space-y-2">
                    {newEpisodes.map(renderEpisodeRow)}
                  </div>
                </section>
              )}

              {/* All episodes */}
              <div className="space-y-2">
                {feed?.episodes.map(renderEpisodeRow)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
