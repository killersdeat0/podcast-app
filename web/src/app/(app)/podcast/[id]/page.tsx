'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams, useParams, useRouter } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { SkeletonEpisodeRow } from '@/components/ui/Skeleton'
import type { PodcastFeed, Episode } from '@/lib/rss/parser'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { toast } from 'sonner'
import { useUserPlaylists } from '@/hooks/useUserPlaylists'
import { addEpisodeToPlaylist } from '@/lib/playlists/addEpisodeToPlaylist'
import { Play, Plus, Check } from 'lucide-react'
import { computeNewEpisodes } from '@/lib/subscriptions/computeNewEpisodes'
import { mergeEpisodeSources } from '@/lib/episodes/mergeEpisodeSources'
import * as Dialog from '@radix-ui/react-dialog'
import AuthPromptModal from '@/components/ui/AuthPromptModal'
import UpgradeModal from '@/components/ui/UpgradeModal'
import AddToPlaylistPopover from '@/components/ui/AddToPlaylistPopover'

interface SubscriptionRow {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
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
  const paramFeedUrl = params.get('feed') ?? ''
  const paramTitle = params.get('title') ?? ''
  const paramArtwork = params.get('artwork') ?? ''
  const { play, clientQueue, enqueueClient, dequeueClient } = usePlayer()
  const { isGuest, tier: contextTier } = useUser()
  const s = useStrings()
  const router = useRouter()

  // Is `id` a numeric iTunes collection ID?
  const collectionId = /^\d+$/.test(id) ? id : null

  // feedUrl/title/artwork start from URL params (present for discover links) and are
  // backfilled from subscription data or RSS response for clean subscribed-only URLs.
  const [feedUrl, setFeedUrl] = useState(paramFeedUrl)
  const [title, setTitle] = useState(paramTitle)
  const [artwork, setArtwork] = useState(paramArtwork)

  const [feed, setFeed] = useState<PodcastFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(new Set())
  const [togglingQueueGuid, setTogglingQueueGuid] = useState<string | null>(null)
  const userPlaylists = useUserPlaylists(isGuest)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [oldLastVisitedAt, setOldLastVisitedAt] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [episodeFilter, setEpisodeFilter] = useState('')
  const [savingFilter, setSavingFilter] = useState(false)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [episodePage, setEpisodePage] = useState(0)
  const [searchPage, setSearchPage] = useState(0)
  const [storedNewEpisodes, setStoredNewEpisodes] = useState<Episode[]>([])
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, { positionSeconds: number; completed: boolean }>>(new Map())

  // Navigation warning modal state
  const [navWarningOpen, setNavWarningOpen] = useState(false)
  const [queuingAll, setQueuingAll] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const pendingNavRef = useRef<{ href: string } | null>(null)
  const isBeforeUnloadRef = useRef(false)
  const hasResetRef = useRef(false)

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
      .then((data: PodcastFeed) => {
        setFeed(data)
        if (!title && data.title) setTitle(data.title)
        if (!artwork && data.artworkUrl) setArtwork(data.artworkUrl)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [feedUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check subscription status + current queue + tier
  useEffect(() => {
    if (isGuest) {
      setSubscribed(false)
      setSubscription(null)
      setQueuedGuids(new Set(clientQueue.map((e) => e.guid)))
      return
    }
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((subs: SubscriptionRow[]) => {
        // Match by feed URL param (discover links), iTunes collection ID, or encoded feed URL
        const sub = subs.find((s) => {
          if (paramFeedUrl && s.feed_url === paramFeedUrl) return true
          if (s.collection_id && s.collection_id === id) return true
          if (encodeURIComponent(s.feed_url) === id) return true
          return false
        }) ?? null
        if (sub) {
          // Backfill feedUrl/title/artwork from subscription if not already in URL params
          if (!feedUrl) setFeedUrl(sub.feed_url)
          if (!title) setTitle(sub.title)
          if (!artwork) setArtwork(sub.artwork_url ?? '')
        }
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
  }, [id, isGuest]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Fetch episode progress for this feed to show played/partial indicators
  const refreshEpisodeProgress = useCallback(() => {
    if (!feedUrl || isGuest) return
    fetch(`/api/progress/completed?feedUrl=${encodeURIComponent(feedUrl)}`)
      .then((r) => r.json())
      .then((data: { progress: Array<{ guid: string; positionSeconds: number; completed: boolean }> }) => {
        setEpisodeProgress(new Map((data.progress ?? []).map((p) => [p.guid, p])))
      })
      .catch(() => {})
  }, [feedUrl, isGuest])

  useEffect(() => {
    refreshEpisodeProgress()
  }, [refreshEpisodeProgress])

  useEffect(() => {
    window.addEventListener('history-changed', refreshEpisodeProgress)
    return () => window.removeEventListener('history-changed', refreshEpisodeProgress)
  }, [refreshEpisodeProgress])

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
    return computeNewEpisodes({
      episodes: feed.episodes,
      storedNewEpisodes,
      oldLastVisitedAt,
      subscription,
      tier: contextTier ?? 'free',
      isGuest,
    })
  }, [feed, oldLastVisitedAt, contextTier, subscription, storedNewEpisodes, isGuest])

  const unqueuedNewEpisodes = useMemo(
    () => newEpisodes.filter((ep) => !queuedGuids.has(ep.guid)),
    [newEpisodes, queuedGuids],
  )

  // Search results: merge RSS + iTunes episodes (dedup by guid), filter by query
  const searchResults = useMemo((): Episode[] => {
    if (!searchQuery) return []
    const q = searchQuery.toLowerCase()
    const rssEps = feed?.episodes ?? []
    if (collectionId) {
      const merged = mergeEpisodeSources(rssEps, (itunesEpisodes ?? []).map(itunesToEpisode))
      return merged.filter((ep) => ep.title.toLowerCase().includes(q))
    }
    // No collectionId: search RSS only
    return rssEps.filter((ep) => ep.title.toLowerCase().includes(q))
  }, [searchQuery, collectionId, itunesEpisodes, feed])

  const PAGE_SIZE = 20
  const totalPages = Math.ceil((feed?.episodes.length ?? 0) / PAGE_SIZE)
  const pagedEpisodes = useMemo(() => {
    const all = feed?.episodes ?? []
    return all.slice(episodePage * PAGE_SIZE, (episodePage + 1) * PAGE_SIZE)
  }, [feed, episodePage])

  const searchTotalPages = Math.ceil(searchResults.length / PAGE_SIZE)
  const pagedSearchResults = useMemo(
    () => searchResults.slice(searchPage * PAGE_SIZE, (searchPage + 1) * PAGE_SIZE),
    [searchResults, searchPage],
  )

  // On mount (after feed + subscription loaded): update latest_episode_pub_date + new_episode_count
  // Also cache the new episode metadata so they remain visible after aging out of the RSS feed
  useEffect(() => {
    if (!feed || !feedUrl || !subscribed) return
    const newestPubDate = feed.episodes[0]?.pubDate
    if (!newestPubDate) return
    async function update() {
      await fetch('/api/subscriptions', {
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
            artworkUrl: feed?.artworkUrl ?? '',
            podcastTitle: title,
          })),
        }),
      })
      window.dispatchEvent(new Event('subscriptions-changed'))
    }
    update().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, feedUrl, subscribed, newEpisodes.length])

  // On unmount: update last_visited_at + reset count (skipped if already done in proceedWithNavigation)
  useEffect(() => {
    if (!feedUrl || !subscribed) return
    return () => {
      if (hasResetRef.current) return
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

  async function proceedWithNavigation() {
    setNavWarningOpen(false)
    isBeforeUnloadRef.current = false
    const pending = pendingNavRef.current
    pendingNavRef.current = null
    // Eagerly reset before navigating so the sidebar re-fetch sees the cleared count immediately
    if (feedUrl && subscribed) {
      hasResetRef.current = true
      await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl, lastVisitedAt: new Date().toISOString(), newEpisodeCount: 0 }),
      }).catch(() => {})
      window.dispatchEvent(new Event('subscriptions-changed'))
    }
    if (pending) {
      router.push(pending.href)
    }
  }

  async function queueAllAndLeave() {
    if (contextTier !== 'paid' && queuedGuids.size + unqueuedNewEpisodes.length > 10) {
      setNavWarningOpen(false)
      setUpgradeModalOpen(true)
      return
    }
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
      window.dispatchEvent(new Event('queue-changed'))
    } finally {
      setQueuingAll(false)
    }
    proceedWithNavigation()
  }

  async function toggleSubscribe() {
    if (isGuest) {
      setAuthPromptOpen(true)
      return
    }
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

  function showQueueLimit(msg: string) {
    toast.error(msg)
  }

  async function toggleQueue(episode: Episode) {
    setTogglingQueueGuid(episode.guid)
    try {
      const inQueue = queuedGuids.has(episode.guid)
      if (isGuest) {
        if (inQueue) {
          dequeueClient(episode.guid)
          setQueuedGuids((prev) => { const s = new Set(prev); s.delete(episode.guid); return s })
        } else {
          if (clientQueue.length >= 10) {
            showQueueLimit(s.queue.limit_reached_guest)
            return
          }
          enqueueClient({
            guid: episode.guid,
            feedUrl,
            title: episode.title,
            audioUrl: episode.audioUrl,
            artworkUrl: artwork || feed?.artworkUrl || '',
            podcastTitle: title,
            duration: episode.duration ?? 0,
            chapterUrl: episode.chapterUrl,
          })
          setQueuedGuids((prev) => new Set([...prev, episode.guid]))
        }
        return
      }
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
        window.dispatchEvent(new Event('queue-changed'))
      } else {
        const res = await fetch('/api/queue', {
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
        if (!res.ok) {
          if (res.status === 403) showQueueLimit(s.queue.limit_reached_free)
          return
        }
        setQueuedGuids((prev) => new Set([...prev, episode.guid]))
        window.dispatchEvent(new Event('queue-changed'))
      }
    } finally {
      setTogglingQueueGuid(null)
    }
  }

  function addToPlaylist(playlistId: string, ep: Episode) {
    return addEpisodeToPlaylist(playlistId, {
      guid: ep.guid,
      feedUrl: feedUrl,
      title: ep.title,
      audioUrl: ep.audioUrl,
      artworkUrl: artwork || null,
      podcastTitle: title,
      duration: ep.duration ?? undefined,
      pubDate: ep.pubDate,
      description: ep.description,
    })
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

  function renderEpisodeRow(ep: Episode, isNew = false) {
    const inQueue = queuedGuids.has(ep.guid)
    const prog = episodeProgress.get(ep.guid)
    const isPlayed = prog?.completed ?? false
    const pct = (!isPlayed && prog && ep.duration && ep.duration > 0)
      ? Math.min(100, Math.round((prog.positionSeconds / ep.duration) * 100))
      : null
    const remaining = (pct !== null && ep.duration)
      ? formatDuration(ep.duration - prog!.positionSeconds)
      : null
    return (
      <div key={ep.guid} className="group flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors">
        {/* New dot */}
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isNew ? 'bg-violet-400' : 'opacity-0'}`} />

        {/* Play button — fades in on hover */}
        <button
          onClick={() => playEpisode(ep)}
          title="Play"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all text-transparent bg-transparent group-hover:bg-violet-600 group-hover:text-white"
        >
          <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
        </button>

        {/* Title + metadata */}
        <button onClick={() => playEpisode(ep)} className="flex-1 text-left min-w-0">
          <p className={`text-sm font-medium truncate ${isPlayed ? 'text-gray-400' : 'text-white'}`}>{ep.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">{new Date(ep.pubDate).toLocaleDateString()}</span>
            {ep.duration && <span className="text-xs text-gray-500">{formatDuration(ep.duration)}</span>}
            {isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">New</span>}
            {isPlayed && !isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">✓ Played</span>}
            {pct !== null && remaining && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{remaining} left</span>
            )}
          </div>
          {pct !== null && (
            <div className="mt-1.5 h-0.5 w-full bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
        </button>

        {/* Queue button — hidden until hover, stays visible when queued */}
        <button
          onClick={() => toggleQueue(ep)}
          disabled={togglingQueueGuid === ep.guid}
          title={inQueue ? s.podcast_page.remove_from_queue : s.podcast_page.add_to_queue}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            inQueue
              ? 'text-violet-400 hover:text-red-400 bg-violet-500/10'
              : 'text-gray-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100'
          }`}
        >
          {togglingQueueGuid === ep.guid
            ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
            : inQueue ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </button>
        {!isGuest && userPlaylists.length > 0 && (
          <AddToPlaylistPopover
            playlists={userPlaylists}
            onSelect={(playlistId) => addToPlaylist(playlistId, ep)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Hero header — blurred artwork backdrop */}
      <div className="relative overflow-hidden mb-6">
        {artwork && (
          <div
            className="absolute inset-0 scale-110 blur-2xl opacity-60"
            style={{ backgroundImage: `url(${artwork})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/85" />
        <div className="relative flex gap-4 md:gap-5 items-end px-4 md:px-8 pt-8 md:pt-10 pb-6">
          {artwork && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artwork} alt={title} className="w-24 h-24 md:w-36 md:h-36 rounded-xl md:rounded-2xl object-cover flex-shrink-0 shadow-2xl ring-1 ring-white/10" />
          )}
          <div className="min-w-0 pb-1">
            <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-1">{title}</h1>
            {feed && <p className="text-gray-300/80 text-sm line-clamp-2 mb-3 leading-relaxed">{feed.description}</p>}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={toggleSubscribe}
                disabled={subscribing}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
                  subscribed
                    ? 'bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/20'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                }`}
              >
                {subscribing ? '...' : subscribed ? s.podcast_page.subscribed : s.podcast_page.subscribe}
              </button>
              {process.env.NODE_ENV === 'development' && subscribed && (
                <button onClick={devResetLastVisited} className="text-xs text-red-400 underline">
                  [dev] reset last visited → 7 days ago
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 pb-8">
        {error ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-3">Failed to load episodes.</p>
            <button onClick={() => window.location.reload()} className="text-violet-400 hover:text-violet-300 text-sm">
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-1 mt-2">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
          </div>
        ) : feed?.episodes.length === 0 ? (
          <p className="text-gray-400 text-sm">No episodes found.</p>
        ) : (
          <>
            {/* Guest nudge — sign in to track new episodes */}
            {isGuest && (
              <div className="flex items-center gap-3 bg-violet-950/50 border border-violet-800/40 rounded-xl px-4 py-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{s.podcast_page.guest_nudge_title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.podcast_page.guest_nudge_description}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a href={`/login?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors">
                    {s.podcast_page.guest_nudge_login}
                  </a>
                  <a href="/signup" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                    {s.podcast_page.guest_nudge_signup}
                  </a>
                </div>
              </div>
            )}

            {/* Search */}
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setEpisodePage(0); setSearchPage(0) }}
              placeholder={s.podcast_page.search_placeholder}
              className="w-full bg-gray-900 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-violet-500 mb-4"
            />

            {/* Filter skeleton */}
            {subscribed && contextTier === null && (
              <div className="flex items-center gap-2 mb-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-800 rounded-full" />
                <div className="h-6 w-14 bg-gray-800 rounded-full" />
                <div className="h-6 w-14 bg-gray-800 rounded-full" />
              </div>
            )}

            {/* Episode filter — paid: compact pill row */}
            {subscribed && contextTier === 'paid' && (
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600">{s.podcast_page.notifications_label}</span>
                  <button
                    onClick={async () => {
                      if (subscription?.episode_filter === '') return
                      setSavingFilter(true)
                      await fetch('/api/subscriptions', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ feedUrl, episodeFilter: '', newEpisodeCount: 0 }),
                      })
                      setSubscription((prev) => prev ? { ...prev, episode_filter: '' } : prev)
                      setEpisodeFilter('')
                      setSavingFilter(false)
                      window.dispatchEvent(new Event('subscriptions-changed'))
                    }}
                    disabled={savingFilter}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                      subscription?.episode_filter === ''
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {s.podcast_page.filter_off}
                  </button>
                  <button
                    onClick={async () => {
                      if (subscription?.episode_filter === '*') return
                      setSavingFilter(true)
                      await fetch('/api/subscriptions', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ feedUrl, episodeFilter: '*' }),
                      })
                      setSubscription((prev) => prev ? { ...prev, episode_filter: '*' } : prev)
                      setEpisodeFilter('')
                      setSavingFilter(false)
                    }}
                    disabled={savingFilter}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                      subscription?.episode_filter === '*'
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    📻 All
                  </button>
                  <button
                    onClick={() => setFilterModalOpen(true)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      subscription?.episode_filter && subscription.episode_filter !== '*'
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {subscription?.episode_filter && subscription.episode_filter !== '*'
                      ? `🎯 "${subscription.episode_filter}"`
                      : s.podcast_page.filter_custom}
                  </button>
                  <button
                    onClick={() => setHelpOpen((v) => !v)}
                    className="text-gray-700 hover:text-gray-400 transition-colors text-sm leading-none"
                    title={s.podcast_page.filter_help_button}
                  >
                    ⓘ
                  </button>
                </div>
                {helpOpen && (
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    {s.podcast_page.filter_help_text}
                  </p>
                )}
              </div>
            )}

            {/* Episode filter — free: compact pill row */}
            {subscribed && contextTier === 'free' && (
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className="text-xs text-gray-600">{s.podcast_page.notifications_label}</span>
                <button
                  onClick={async () => {
                    const next = subscription?.episode_filter === '*' ? '' : '*'
                    setSavingFilter(true)
                    await fetch('/api/subscriptions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedUrl, episodeFilter: next, ...(next === '' ? { newEpisodeCount: 0 } : {}) }),
                    })
                    setSubscription((prev) => prev ? { ...prev, episode_filter: next } : prev)
                    setSavingFilter(false)
                    if (next === '') window.dispatchEvent(new Event('subscriptions-changed'))
                  }}
                  disabled={savingFilter}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                    subscription?.episode_filter !== ''
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  📻 All
                </button>
                <button
                  onClick={async () => {
                    if (subscription?.episode_filter === '') return
                    setSavingFilter(true)
                    await fetch('/api/subscriptions', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedUrl, episodeFilter: '', newEpisodeCount: 0 }),
                    })
                    setSubscription((prev) => prev ? { ...prev, episode_filter: '' } : prev)
                    setSavingFilter(false)
                    window.dispatchEvent(new Event('subscriptions-changed'))
                  }}
                  disabled={savingFilter}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                    subscription?.episode_filter === ''
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {s.podcast_page.filter_off}
                </button>
                <a href="/upgrade" className="text-xs text-gray-600 hover:text-violet-400 transition-colors ml-1">
                  Pro: custom filters →
                </a>
              </div>
            )}

            {/* Custom filter modal */}
            <Dialog.Root open={filterModalOpen} onOpenChange={(o) => { if (!o) { setEpisodeFilter(subscription?.episode_filter ?? ''); setFilterModalOpen(false) } }}>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-xl">
                    <Dialog.Title className="text-base font-semibold text-white mb-1">{s.podcast_page.filter_modal_title}</Dialog.Title>
                    <Dialog.Description className="text-xs text-gray-400 mb-4">{s.podcast_page.filter_modal_description}</Dialog.Description>
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
                      <Dialog.Close asChild>
                        <button className="flex-1 py-2 rounded-lg text-sm bg-gray-800 text-gray-300 hover:text-white transition-colors">
                          Cancel
                        </button>
                      </Dialog.Close>
                      <button
                        onClick={() => saveEpisodeFilter().then(() => setFilterModalOpen(false))}
                        disabled={savingFilter}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                      >
                        {savingFilter ? '...' : s.podcast_page.filter_save}
                      </button>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            {/* Auth prompt modal for guests */}
            <AuthPromptModal
              open={authPromptOpen}
              onClose={() => setAuthPromptOpen(false)}
              returnTo={typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined}
            />
            <UpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />

            {/* Navigation warning modal */}
            <Dialog.Root open={navWarningOpen} onOpenChange={(o) => { if (!o && !queuingAll) { setNavWarningOpen(false); pendingNavRef.current = null; isBeforeUnloadRef.current = false } }}>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-xl">
                    <Dialog.Title className="text-base font-semibold text-white mb-1">{s.podcast_page.nav_warning_title}</Dialog.Title>
                    <Dialog.Description className="text-xs text-gray-400 mb-6">
                      {s.podcast_page.nav_warning_body.replace('{{n}}', String(unqueuedNewEpisodes.length))}
                    </Dialog.Description>
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
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            {/* Search results or episode list */}
            {searchQuery ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                    {s.podcast_page.search_results}{!itunesLoading && searchResults.length > 0 ? ` (${searchResults.length})` : ''}
                  </span>
                  <div className="flex-1 h-px bg-gray-800/60" />
                  {itunesLoading && collectionId && (
                    <span className="text-xs text-gray-600 animate-pulse">{s.podcast_page.loading_more}</span>
                  )}
                  {searchTotalPages > 1 && (
                    <span className="text-xs text-gray-700">{searchPage + 1} / {searchTotalPages}</span>
                  )}
                </div>
                {pagedSearchResults.length === 0 && itunesLoading ? (
                  <div className="space-y-1 mt-1">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
                  </div>
                ) : pagedSearchResults.length === 0 ? (
                  <p className="text-gray-500 text-sm py-8 text-center">No episodes found.</p>
                ) : (
                  pagedSearchResults.map((ep) => renderEpisodeRow(ep))
                )}
                {searchTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800/60">
                    <button onClick={() => setSearchPage((p) => Math.max(0, p - 1))} disabled={searchPage === 0} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Previous</button>
                    <button onClick={() => setSearchPage((p) => Math.min(searchTotalPages - 1, p + 1))} disabled={searchPage === searchTotalPages - 1} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* New episodes — flat rows with violet accent, no card wrapper */}
                {subscribed && newEpisodes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">New ✨</span>
                      <div className="flex-1 h-px bg-violet-900/40" />
                    </div>
                    {newEpisodes.map((ep) => renderEpisodeRow(ep, true))}
                  </div>
                )}

                {/* All episodes — flat list */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">All Episodes</span>
                    <div className="flex-1 h-px bg-gray-800/60" />
                    {totalPages > 1 && <span className="text-xs text-gray-700">{episodePage + 1} / {totalPages}</span>}
                  </div>
                  {pagedEpisodes.map((ep) => renderEpisodeRow(ep))}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800/60">
                      <button onClick={() => setEpisodePage((p) => Math.max(0, p - 1))} disabled={episodePage === 0} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Previous</button>
                      <button onClick={() => setEpisodePage((p) => Math.min(totalPages - 1, p + 1))} disabled={episodePage === totalPages - 1} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
