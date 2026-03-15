'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams, useParams, useRouter } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { SkeletonEpisodeRow } from '@/components/ui/Skeleton'
import type { PodcastFeed, Episode } from '@/lib/rss/parser'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { mergeNewEpisodes } from '@/lib/subscriptions/mergeNewEpisodes'

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
  const s = useStrings()
  const router = useRouter()

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
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [userTier, setUserTier] = useState<'free' | 'paid' | null>(null)
  const [episodePage, setEpisodePage] = useState(0)
  const [storedNewEpisodes, setStoredNewEpisodes] = useState<Episode[]>([])

  // Navigation warning modal state
  const [navWarningOpen, setNavWarningOpen] = useState(false)
  const [queuingAll, setQueuingAll] = useState(false)
  const pendingNavRef = useRef<{ href: string } | null>(null)
  const isBeforeUnloadRef = useRef(false)

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
        // Only populate modal input with actual text filters, not sentinels
        const f = sub?.episode_filter
        setEpisodeFilter(f && f !== '*' ? f : '')
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

  // Fetch stored unseen episodes from DB (supplements RSS for episodes aged out of the feed)
  useEffect(() => {
    if (!feedUrl || !oldLastVisitedAt || !subscribed) return
    fetch(`/api/podcasts/unseen?feedUrl=${encodeURIComponent(feedUrl)}&since=${encodeURIComponent(oldLastVisitedAt)}`)
      .then((r) => r.json())
      .then((rows: Array<{
        guid: string; title: string; audio_url: string; pub_date: string;
        duration: number | null; artwork_url: string; chapter_url: string | null;
      }>) => {
        setStoredNewEpisodes(rows.map((r) => ({
          guid: r.guid,
          title: r.title,
          audioUrl: r.audio_url,
          pubDate: r.pub_date,
          duration: r.duration,
          description: '',
          artworkUrl: r.artwork_url,
          chapterUrl: r.chapter_url,
        })))
      })
      .catch(() => {})
  }, [feedUrl, oldLastVisitedAt, subscribed])

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
  // Paid episode_filter semantics: null/'' = no notifications, '*' = all new, any other text = custom filter
  // Free users: always show all new episodes (filter is a paid-only customisation)
  // storedNewEpisodes supplements the RSS feed with episodes that may have aged out of the feed
  const newEpisodes = useMemo(() => {
    if (!feed) return []
    const filter = subscription?.episode_filter
    const rssBaseEps = oldLastVisitedAt
      ? feed.episodes.filter((ep) => new Date(ep.pubDate) > new Date(oldLastVisitedAt))
      : feed.episodes
    // Merge stored episodes (aged out of RSS) with current RSS results, dedup by guid
    const baseEps = mergeNewEpisodes(rssBaseEps, storedNewEpisodes)
    if (userTier !== 'paid') {
      // Free: '*' or null = all new episodes; '' = opted out
      return filter === '' ? [] : baseEps
    }
    if (!filter) return []                    // paid, no setting: no notifications
    if (filter === '*') return baseEps        // paid, all episodes
    const f = filter.toLowerCase()
    return baseEps.filter((ep) => ep.title.toLowerCase().includes(f))
  }, [feed, oldLastVisitedAt, userTier, subscription, storedNewEpisodes])

  const unqueuedNewEpisodes = useMemo(
    () => newEpisodes.filter((ep) => !queuedGuids.has(ep.guid)),
    [newEpisodes, queuedGuids],
  )

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

  const PAGE_SIZE = 20
  const totalPages = Math.ceil((feed?.episodes.length ?? 0) / PAGE_SIZE)
  const pagedEpisodes = useMemo(() => {
    const all = feed?.episodes ?? []
    return all.slice(episodePage * PAGE_SIZE, (episodePage + 1) * PAGE_SIZE)
  }, [feed, episodePage])

  // On mount (after feed + subscription loaded): update latest_episode_pub_date + new_episode_count
  // Also cache the new episode metadata so they remain visible after aging out of the RSS feed
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
        newEpisodesToCache: newEpisodes.map((ep) => ({
          guid: ep.guid,
          title: ep.title,
          audioUrl: ep.audioUrl,
          pubDate: ep.pubDate,
          duration: ep.duration,
          artworkUrl: feed.artworkUrl ?? '',
          podcastTitle: title,
        })),
      }),
    })
    window.dispatchEvent(new Event('subscriptions-changed'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Navigation guard: intercepts link clicks + beforeunload when unqueued new episodes exist.
  // Uses document capture-phase click listener rather than history.pushState patching —
  // more reliable since Next.js App Router may not go through pushState for all navigations.
  useEffect(() => {
    if (unqueuedNewEpisodes.length === 0) return

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      if (href === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      pendingNavRef.current = { href }
      isBeforeUnloadRef.current = false
      setNavWarningOpen(true)
    }

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      isBeforeUnloadRef.current = true
      setNavWarningOpen(true)
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [unqueuedNewEpisodes.length])

  function proceedWithNavigation() {
    setNavWarningOpen(false)
    isBeforeUnloadRef.current = false
    const pending = pendingNavRef.current
    pendingNavRef.current = null
    if (pending) {
      router.push(pending.href)
    }
  }

  async function queueAllAndLeave() {
    setQueuingAll(true)
    try {
      await Promise.all(
        unqueuedNewEpisodes.map((ep) =>
          fetch('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guid: ep.guid,
              feedUrl,
              title: ep.title,
              audioUrl: ep.audioUrl,
              artworkUrl: artwork || feed?.artworkUrl || '',
              podcastTitle: title,
              duration: ep.duration,
              pubDate: ep.pubDate,
              description: ep.description,
            }),
          }),
        ),
      )
      setQueuedGuids((prev) => {
        const next = new Set(prev)
        unqueuedNewEpisodes.forEach((ep) => next.add(ep.guid))
        return next
      })
    } finally {
      setQueuingAll(false)
    }
    proceedWithNavigation()
  }

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
            onChange={(e) => { setSearchQuery(e.target.value); setEpisodePage(0) }}
            placeholder={collectionId ? 'Search all episodes via iTunes... 🔍' : 'Search episodes... 🔍'}
            className="w-full bg-gray-900 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500 mb-3"
          />

          {/* Skeleton while subscription/tier data is still loading */}
          {userTier === null && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3 animate-pulse">
              <div className="h-3 bg-gray-800 rounded w-32 mb-3" />
              <div className="flex gap-2 mb-3">
                <div className="flex-1 h-9 bg-gray-800 rounded-lg" />
                <div className="flex-1 h-9 bg-gray-800 rounded-lg" />
              </div>
              <div className="h-10 bg-gray-800 rounded-lg" />
            </div>
          )}

          {/* Episode filter — paid: two buttons + current setting */}
          {subscribed && userTier === 'paid' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">🎯 New episode filter</p>
                <button
                  onClick={() => setHelpOpen((v) => !v)}
                  className="text-gray-600 hover:text-gray-400 transition-colors text-sm leading-none"
                  title="What is this?"
                >
                  ⓘ
                </button>
              </div>
              {helpOpen && (
                <p className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2 mb-3">
                  Control which new episodes appear in your ✨ New Episodes section for this podcast. <strong className="text-gray-300">All episodes</strong> notifies you about everything new. <strong className="text-gray-300">Custom filter</strong> narrows it to episodes matching a keyword — great for podcasts that mix shows or topics. Select neither to turn off new episode tracking entirely. 🔕
                </p>
              )}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={async () => {
                    const next = subscription?.episode_filter === '*' ? '' : '*'
                    setSavingFilter(true)
                    await fetch('/api/subscriptions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedUrl, episodeFilter: next }),
                    })
                    setSubscription((prev) => prev ? { ...prev, episode_filter: next } : prev)
                    setEpisodeFilter('')
                    setSavingFilter(false)
                  }}
                  disabled={savingFilter}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    subscription?.episode_filter === '*'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  📻 All episodes
                </button>
                <button
                  onClick={() => setFilterModalOpen(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    subscription?.episode_filter && subscription.episode_filter !== '*'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  🎯 Custom filter
                </button>
              </div>
              <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Current setting</p>
                  <p className="text-sm text-violet-300 font-medium">
                    {!subscription?.episode_filter && '🔕 No notifications'}
                    {subscription?.episode_filter === '*' && '📻 All episodes'}
                    {subscription?.episode_filter && subscription.episode_filter !== '*' && `🎯 "${subscription.episode_filter}"`}
                  </p>
                </div>
                {subscription?.episode_filter && (
                  <button
                    onClick={async () => {
                      setSavingFilter(true)
                      await fetch('/api/subscriptions', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ feedUrl, episodeFilter: '' }),
                      })
                      setSubscription((prev) => prev ? { ...prev, episode_filter: '' } : prev)
                      setEpisodeFilter('')
                      setSavingFilter(false)
                    }}
                    title="Turn off notifications"
                    className="text-gray-500 hover:text-red-400 transition-colors p-1 text-base"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          )}
          {subscribed && userTier === 'free' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">🎯 New episode filter</p>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={async () => {
                    const next = subscription?.episode_filter === '*' ? '' : '*'
                    setSavingFilter(true)
                    await fetch('/api/subscriptions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedUrl, episodeFilter: next }),
                    })
                    setSubscription((prev) => prev ? { ...prev, episode_filter: next } : prev)
                    setSavingFilter(false)
                  }}
                  disabled={savingFilter}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    subscription?.episode_filter !== ''
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  📻 All episodes
                </button>
                <button
                  onClick={async () => {
                    if (subscription?.episode_filter === '') return
                    setSavingFilter(true)
                    await fetch('/api/subscriptions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedUrl, episodeFilter: '' }),
                    })
                    setSubscription((prev) => prev ? { ...prev, episode_filter: '' } : prev)
                    setSavingFilter(false)
                  }}
                  disabled={savingFilter}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    subscription?.episode_filter === ''
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  🔕 Off
                </button>
              </div>
              <div className="bg-gray-800 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400">
                  ✨ <span className="text-gray-300 font-medium">Pro</span> unlocks custom keyword filters — only get notified about episodes that match a topic or series name. <a href="/upgrade" className="text-violet-400 hover:text-violet-300 transition-colors">Upgrade →</a>
                </p>
              </div>
            </div>
          )}

          {/* Custom filter modal */}
          {filterModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="text-base font-semibold text-white mb-1">🎯 Custom episode filter</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Only episodes whose title contains this keyword will appear in your ✨ New Episodes section. Leave blank to see all.
                </p>


                <input
                  type="text"
                  value={episodeFilter}
                  onChange={(e) => setEpisodeFilter(e.target.value)}
                  placeholder="e.g. 90 Day, interview, recap..."
                  autoFocus
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500 mb-4"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEpisodeFilter().then(() => setFilterModalOpen(false))
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEpisodeFilter(subscription?.episode_filter ?? ''); setFilterModalOpen(false) }}
                    className="flex-1 py-2 rounded-lg text-sm bg-gray-800 text-gray-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEpisodeFilter().then(() => setFilterModalOpen(false))}
                    disabled={savingFilter}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                  >
                    {savingFilter ? '...' : 'Save 🎯'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Navigation warning modal */}
          {navWarningOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="text-base font-semibold text-white mb-1">
                  {s.podcast_page.nav_warning_title}
                </h3>
                <p className="text-xs text-gray-400 mb-6">
                  {s.podcast_page.nav_warning_body.replace('{{n}}', String(unqueuedNewEpisodes.length))}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={queueAllAndLeave}
                    disabled={queuingAll}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                  >
                    {queuingAll ? s.podcast_page.nav_warning_queuing : s.podcast_page.nav_warning_queue_and_leave}
                  </button>
                  <button
                    onClick={proceedWithNavigation}
                    disabled={queuingAll}
                    className="w-full py-2 rounded-lg text-sm bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    {s.podcast_page.nav_warning_leave}
                  </button>
                  <button
                    onClick={() => { setNavWarningOpen(false); pendingNavRef.current = null; isBeforeUnloadRef.current = false }}
                    disabled={queuingAll}
                    className="w-full py-2 rounded-lg text-sm bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    {s.podcast_page.nav_warning_stay}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search results */}
          {searchQuery ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Search Results
              </h2>
              <div className="space-y-2">
                {itunesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonEpisodeRow key={i} />)
                ) : searchResults.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 text-center">No episodes found.</p>
                ) : (
                  searchResults.map(renderEpisodeRow)
                )}
              </div>
            </div>
          ) : (
            <>
              {/* New episodes section */}
              {subscribed && newEpisodes.length > 0 && (
                <section className="bg-violet-950/20 border border-violet-900/30 rounded-xl p-4 mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-3">
                    New Episodes ✨
                  </h2>
                  <div className="space-y-2">
                    {newEpisodes.map(renderEpisodeRow)}
                  </div>
                </section>
              )}

              {/* All episodes */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    All Episodes
                  </h2>
                  {totalPages > 1 && (
                    <span className="text-xs text-gray-600">
                      {episodePage + 1} / {totalPages}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {pagedEpisodes.map(renderEpisodeRow)}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
                    <button
                      onClick={() => setEpisodePage((p) => Math.max(0, p - 1))}
                      disabled={episodePage === 0}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={() => setEpisodePage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={episodePage === totalPages - 1}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
