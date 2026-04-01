'use client'

import { useCallback, useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams, useParams, useRouter } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { SkeletonEpisodeRow } from '@/components/ui/Skeleton'
import type { PodcastFeed, Episode } from '@/lib/rss/parser'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { toast } from 'sonner'
import { useUserPlaylists } from '@/hooks/useUserPlaylists'
import { addEpisodeToPlaylist } from '@/lib/playlists/addEpisodeToPlaylist'
import { Play, Plus, Check, RefreshCw, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'
import DOMPurify from 'dompurify'
import { computeNewEpisodes } from '@/lib/subscriptions/computeNewEpisodes'
import { mergeEpisodeSources } from '@/lib/episodes/mergeEpisodeSources'
import { PodcastCard } from '@/components/podcasts/PodcastCard'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'
import type { ItunesResult } from '@/lib/itunes/search'
import * as Dialog from '@radix-ui/react-dialog'
import AuthPromptModal from '@/components/ui/AuthPromptModal'
import UpgradeModal from '@/components/ui/UpgradeModal'
import AddToPlaylistPopover from '@/components/ui/AddToPlaylistPopover'
import { EpisodeProgressOverlay } from '@/components/ui/EpisodeProgressOverlay'
import { ALL_SPEEDS, perShowSpeedKey } from '@/lib/player/speed'

interface SubscriptionRow {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
  last_visited_at: string | null
  latest_episode_pub_date: string | null
  episode_filter: string | null
  speed_override: number | null
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
  const { play, clientQueue, enqueueClient, dequeueClient, nowPlaying, playing, audioRef } = usePlayer()
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
  const [descExpanded, setDescExpanded] = useState(false)
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
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [showUnplayedOnly, setShowUnplayedOnly] = useState(false)
  const [episodeFilter, setEpisodeFilter] = useState('')
  const [savingFilter, setSavingFilter] = useState(false)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [episodePage, setEpisodePage] = useState(0)
  const [searchPage, setSearchPage] = useState(0)
  const [storedNewEpisodes, setStoredNewEpisodes] = useState<Episode[]>([])
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, { positionSeconds: number; positionPct: number | null; completed: boolean }>>(new Map())
  const [livePosition, setLivePosition] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const [openDescGuid, setOpenDescGuid] = useState<string | null>(null)

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

  // Feed refresh key (increment to bypass cache)
  const [feedRefreshKey, setFeedRefreshKey] = useState(0)
  const [episodeLimit, setEpisodeLimit] = useState(15)

  // Per-show playback speed ('' = follow global)
  const [perShowSpeed, setPerShowSpeed] = useState<string>('')

  // All subscriptions (for filtering similar podcasts)
  const [allSubscriptions, setAllSubscriptions] = useState<{ feedUrl: string }[]>([])

  // Similar podcasts
  const [similarPodcasts, setSimilarPodcasts] = useState<ItunesResult[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [similarDebug, setSimilarDebug] = useState<Record<string, unknown> | null>(null)


  useEffect(() => {
    if (!feedUrl) return
    setLoading(true)
    setError(false)
    const url = `/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}&limit=${episodeLimit}${feedRefreshKey > 0 ? '&nocache=1' : ''}`
    fetch(url)
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
  }, [feedUrl, feedRefreshKey, episodeLimit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore sort/filter prefs from localStorage when feedUrl is known
  useEffect(() => {
    if (!feedUrl) return
    const sort = localStorage.getItem(`podcast-sort-${feedUrl}`)
    if (sort === 'oldest') setSortOrder('oldest')
    const filter = localStorage.getItem(`podcast-filter-${feedUrl}`)
    if (filter === 'unfinished') setShowUnplayedOnly(true)
  }, [feedUrl])

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
        setAllSubscriptions(subs.map((s) => ({ feedUrl: s.feed_url })))
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
        // Sync per-show speed from DB into state + localStorage so the player picks it up
        if (sub) {
          const resolvedFeedUrl = sub.feed_url
          if (sub.speed_override != null) {
            const val = String(sub.speed_override)
            setPerShowSpeed(val)
            localStorage.setItem(perShowSpeedKey(resolvedFeedUrl), val)
          } else {
            setPerShowSpeed('')
            localStorage.removeItem(perShowSpeedKey(resolvedFeedUrl))
          }
        }
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

  // Per-show speed is hydrated from the subscription row (DB → localStorage) in the
  // subscription fetch effect above. Guest users get it from localStorage directly.

  function handlePerShowSpeedChange(value: string) {
    setPerShowSpeed(value)
    if (value === '') {
      localStorage.removeItem(perShowSpeedKey(feedUrl))
    } else {
      localStorage.setItem(perShowSpeedKey(feedUrl), value)
    }
    if (!isGuest) {
      fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl, speedOverride: value === '' ? null : Number(value) }),
      }).catch(() => {})
    }
  }

  const handleRefreshFeed = () => setFeedRefreshKey(k => k + 1)

  const fetchSimilar = useCallback(async () => {
    if (!feed) return
    setSimilarLoading(true)
    try {
      const params = new URLSearchParams({ term: feed.title })
      if (collectionId) params.set('excludeId', collectionId)
      else if (feedUrl) params.set('excludeFeedUrl', feedUrl)
      if (allSubscriptions.length > 0)
        params.set('subscribedFeedUrls', allSubscriptions.map((sub: { feedUrl: string }) => sub.feedUrl).join(','))
      const res = await fetch(`/api/podcasts/similar?${params}`)
      const data = await res.json()
      setSimilarPodcasts(data.results ?? [])
      if (process.env.NODE_ENV === 'development') setSimilarDebug(data.debug ?? null)
    } catch {
      setSimilarPodcasts([])
    } finally {
      setSimilarLoading(false)
    }
  }, [feed, collectionId, feedUrl, allSubscriptions])

  // Fetch episode progress for this feed to show played/partial indicators
  const refreshEpisodeProgress = useCallback(() => {
    if (!feedUrl || isGuest) return
    fetch(`/api/progress/completed?feedUrl=${encodeURIComponent(feedUrl)}`)
      .then((r) => r.json())
      .then((data: { progress: Array<{ guid: string; positionSeconds: number; positionPct: number | null; completed: boolean }> }) => {
        setEpisodeProgress(new Map((data.progress ?? []).map((p) => [p.guid, p])))
      })
      .catch(() => {})
  }, [feedUrl, isGuest])

  useEffect(() => {
    refreshEpisodeProgress()
  }, [refreshEpisodeProgress])

  useEffect(() => {
    window.addEventListener('history-changed', refreshEpisodeProgress)
    window.addEventListener('progress-saved', refreshEpisodeProgress)
    return () => {
      window.removeEventListener('history-changed', refreshEpisodeProgress)
      window.removeEventListener('progress-saved', refreshEpisodeProgress)
    }
  }, [refreshEpisodeProgress])

  useLayoutEffect(() => {
    setLivePosition(0)
    setLiveDuration(0)
  }, [nowPlaying?.guid])

  // Sync position immediately on pause so the bar snaps to the correct spot,
  // not the stale interval value (which can lag up to 1s behind a seek).
  useEffect(() => {
    const audio = audioRef.current
    if (!playing && audio && nowPlaying?.feedUrl === feedUrl) {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nowPlaying || nowPlaying.feedUrl !== feedUrl) return
    const id = setInterval(() => {
      if (audioRef.current) {
        setLivePosition(audioRef.current.currentTime)
        setLiveDuration(audioRef.current.duration || 0)
      }
    }, LIVE_POSITION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [nowPlaying, feedUrl, audioRef])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !nowPlaying || nowPlaying.feedUrl !== feedUrl) return
    const onSeeked = () => {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
    audio.addEventListener('seeked', onSeeked)
    return () => audio.removeEventListener('seeked', onSeeked)
  }, [nowPlaying, feedUrl, audioRef])

  useEffect(() => { fetchSimilar() }, [fetchSimilar])

  useEffect(() => {
    window.addEventListener('subscriptions-changed', fetchSimilar)
    return () => window.removeEventListener('subscriptions-changed', fetchSimilar)
  }, [fetchSimilar])

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
  const filteredEpisodes = useMemo(() => {
    let eps = feed?.episodes ?? []
    if (showUnplayedOnly) eps = eps.filter((ep) => !episodeProgress.get(ep.guid)?.completed)
    if (sortOrder === 'oldest') eps = [...eps].reverse()
    return eps
  }, [feed, sortOrder, showUnplayedOnly, episodeProgress])
  const totalPages = Math.ceil(filteredEpisodes.length / PAGE_SIZE)
  const pagedEpisodes = useMemo(
    () => filteredEpisodes.slice(episodePage * PAGE_SIZE, (episodePage + 1) * PAGE_SIZE),
    [filteredEpisodes, episodePage],
  )

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: newEpisodes.length not full array (array ref changes every render); title is a stable URL param
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
        setSubscription({
          feed_url: feedUrl,
          title: title,
          artwork_url: artwork || null,
          collection_id: id ?? null,
          last_visited_at: null,
          latest_episode_pub_date: null,
          episode_filter: '*',
          speed_override: null,
        })
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
      description: episode.description || undefined,
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
    const isCurrentlyPlaying = nowPlaying?.guid === ep.guid && playing
    const isLoaded = nowPlaying?.guid === ep.guid
    const livePct = isLoaded && liveDuration > 0 ? Math.min(100, Math.round((livePosition / liveDuration) * 100)) : null
    // When the episode is loaded but livePct isn't ready yet (audio still seeking),
    // show nothing rather than the stale DB positionPct to avoid a visual jump.
    const pct = isPlayed ? 100 : (livePct ?? prog?.positionPct ?? null)
    const descOpen = openDescGuid === ep.guid
    return (
      <div key={ep.guid}>
        <div className={`group relative flex items-center gap-3 px-4 py-2 rounded-lg transition-all overflow-hidden ${isCurrentlyPlaying ? 'bg-now-playing-surface' : 'hover:bg-surface-container-high/30'} ${isPlayed && !isCurrentlyPlaying ? 'opacity-60 hover:opacity-100' : ''}`}>
          <EpisodeProgressOverlay pct={pct} isPlaying={isCurrentlyPlaying} />
          {/* New dot */}
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isNew ? 'bg-brand' : 'opacity-0'}`} />

          {/* Equalizer bars when loaded, play button otherwise */}
          {isLoaded ? (
            <button
              onClick={() => playEpisode(ep)}
              title={isCurrentlyPlaying ? 'Pause' : 'Play'}
              className="flex-shrink-0 w-8 h-8 flex items-end justify-center gap-0.5 pb-1.5 rounded-full transition-all hover:bg-brand/20"
            >
              {[{ d: '0.6s', delay: '0ms' }, { d: '0.85s', delay: '160ms' }, { d: '0.7s', delay: '80ms' }, { d: '0.95s', delay: '240ms' }].map((bar, i) => (
                <span key={i} className={`eq-bar${isCurrentlyPlaying ? ' playing' : ''}`} style={{ animationDuration: bar.d, animationDelay: bar.delay }} />
              ))}
            </button>
          ) : (
            <button
              onClick={() => playEpisode(ep)}
              title="Play"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all text-on-surface-variant/30 bg-transparent group-hover:bg-brand group-hover:text-on-surface"
            >
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            </button>
          )}

          {/* Title + metadata */}
          <button onClick={() => playEpisode(ep)} className="flex-1 text-left min-w-0">
            <p className={`text-sm font-medium truncate ${isPlayed ? 'text-on-surface-variant' : 'text-on-surface'}`}>{ep.title}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-on-surface-dim">{new Date(ep.pubDate).toLocaleDateString()}</span>
              {ep.duration && <><span className="text-xs text-on-surface-dim">·</span><span className="text-xs text-on-surface-dim">{formatDuration(ep.duration)}</span></>}
              {isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">New</span>}
              {isPlayed && !isNew && <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">✓ Played</span>}
            </div>
          </button>

          {/* Description toggle */}
          {ep.description && (
            <button
              onClick={() => setOpenDescGuid(descOpen ? null : ep.guid)}
              title="Show description"
              className={`p-2 transition flex-shrink-0 ${descOpen ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-on-surface-dim hover:text-on-surface-variant'}`}
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          {/* Queue button — hidden until hover, stays visible when queued */}
          <button
            onClick={() => toggleQueue(ep)}
            disabled={togglingQueueGuid === ep.guid}
            title={inQueue ? s.podcast_page.remove_from_queue : s.podcast_page.add_to_queue}
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all ${
              inQueue
                ? 'text-primary hover:text-error bg-primary/10'
                : `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high ${togglingQueueGuid === ep.guid ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
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
        {ep.description && (
          <div className={`overflow-hidden transition-all duration-200 ease-in-out ${descOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
            <div
              className="pl-14 pr-4 pb-3 pt-1 text-sm text-on-surface-variant [&_a]:text-primary [&_a]:underline [&_p]:mb-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ep.description) }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Hero header — full-bleed blurred artwork backdrop */}
      <div className="relative overflow-hidden mb-6 min-h-[220px] md:min-h-[260px]">
        {loading && !title && (
          <div className="relative z-10 flex gap-5 md:gap-7 items-end px-4 md:px-8 pt-8 pb-12">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-surface-container-high animate-pulse flex-shrink-0" />
            <div className="min-w-0 pb-1 flex-1">
              <div className="h-8 w-2/3 bg-surface-container-high rounded-lg animate-pulse mb-3" />
              <div className="h-4 w-full bg-surface-container-high rounded animate-pulse mb-1" />
              <div className="h-4 w-4/5 bg-surface-container-high rounded animate-pulse mb-4" />
              <div className="h-9 w-28 bg-surface-container-high rounded-full animate-pulse" />
            </div>
          </div>
        )}
        {/* Blurred ambient background */}
        {!loading && artwork && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `url(${artwork})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              transform: 'scale(1.1)',
              filter: 'blur(60px)',
            }}
          />
        )}
        {/* Gradient fade into page background at bottom */}
        {!loading && <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />}
        {/* Content */}
        {!(loading && !title) && <div className="relative z-10 flex gap-5 md:gap-7 items-end px-4 md:px-8 pt-8 pb-12">
          {artwork && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artwork}
              alt={title}
              className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover flex-shrink-0 shadow-2xl ring-1 ring-outline-variant self-start"
            />
          )}
          <div className="min-w-0 pb-1">
            <h1 className="text-3xl md:text-4xl font-bold text-on-surface leading-tight mb-1">{title}</h1>
            {feed && (
              <div className="mb-4">
                <div
                  className={`text-on-surface-variant text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 ${descExpanded ? '' : 'line-clamp-2'}`}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(feed.description) }}
                />
                {feed.description && feed.description.length > 120 && (
                  <button onClick={() => setDescExpanded((v) => !v)} className="text-xs text-on-surface-dim hover:text-on-surface-variant mt-0.5 transition-colors">
                    {descExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={toggleSubscribe}
                disabled={subscribing}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
                  subscribed
                    ? 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface ring-1 ring-outline-variant'
                    : 'bg-primary hover:bg-primary text-on-primary'
                }`}
              >
                {subscribing ? '...' : subscribed ? s.podcast_page.subscribed : s.podcast_page.subscribe}
              </button>
              {/* Per-show playback speed — inline with subscribe button, paid users only */}
              {subscribed && !isGuest && contextTier === 'paid' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant">{s.podcast_page.per_show_speed_label}</span>
                  <select
                    value={perShowSpeed}
                    onChange={(e) => handlePerShowSpeedChange(e.target.value)}
                    className="bg-surface-container text-on-surface text-xs rounded px-2 py-1 border border-outline-variant outline-none"
                  >
                    <option value="">{s.podcast_page.per_show_speed_follow_global}</option>
                    {ALL_SPEEDS.map((spd) => (
                      <option key={spd} value={String(spd)}>{spd}×</option>
                    ))}
                  </select>
                </div>
              )}
              {subscribed && !isGuest && contextTier === 'free' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant">{s.podcast_page.per_show_speed_label}</span>
                  <a href="/upgrade" className="text-xs text-primary hover:underline">{s.player.upgrade_for_speeds}</a>
                </div>
              )}
              {process.env.NODE_ENV === 'development' && subscribed && (
                <button onClick={devResetLastVisited} className="text-xs text-error underline">
                  [dev] reset last visited → 7 days ago
                </button>
              )}
            </div>
          </div>
        </div>}
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 pb-8">
        {error ? (
          <div className="text-center py-12">
            <p className="text-on-surface-variant mb-3">Failed to load episodes.</p>
            <button onClick={() => window.location.reload()} className="text-primary hover:text-primary text-sm">
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-1 mt-2">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
          </div>
        ) : feed?.episodes.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No episodes found.</p>
        ) : (
          <>
            {/* Guest nudge — sign in to track new episodes */}
            {isGuest && (
              <div className="flex items-center gap-3 bg-primary-container/40 border border-primary/20 rounded-xl px-4 py-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface">{s.podcast_page.guest_nudge_title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{s.podcast_page.guest_nudge_description}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <a href={`/login?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors">
                    {s.podcast_page.guest_nudge_login}
                  </a>
                  <a href="/signup" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand hover:bg-brand text-on-surface transition-colors">
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
              className="w-full bg-surface-container-low rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:ring-2 focus:ring-primary mb-4"
            />

            {/* Filter skeleton */}
            {subscribed && contextTier === null && (
              <div className="flex items-center gap-2 mb-4 animate-pulse">
                <div className="h-4 w-24 bg-surface-container rounded-full" />
                <div className="h-6 w-14 bg-surface-container rounded-full" />
                <div className="h-6 w-14 bg-surface-container rounded-full" />
              </div>
            )}

            {/* Episode filter — paid: compact pill row */}
            {subscribed && contextTier === 'paid' && (
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-on-surface-dim">{s.podcast_page.notifications_label}</span>
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
                        ? 'bg-brand text-on-surface'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
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
                        ? 'bg-brand text-on-surface'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    📻 All
                  </button>
                  <button
                    onClick={() => setFilterModalOpen(true)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      subscription?.episode_filter && subscription.episode_filter !== '*'
                        ? 'bg-brand text-on-surface'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {subscription?.episode_filter && subscription.episode_filter !== '*'
                      ? `🎯 "${subscription.episode_filter}"`
                      : s.podcast_page.filter_custom}
                  </button>
                  <button
                    onClick={() => setHelpOpen((v) => !v)}
                    className="text-on-surface-variant hover:text-on-surface-variant transition-colors text-sm leading-none"
                    title={s.podcast_page.filter_help_button}
                  >
                    ⓘ
                  </button>
                </div>
                {helpOpen && (
                  <p className="text-xs text-on-surface-dim mt-2 leading-relaxed">
                    {s.podcast_page.filter_help_text}
                  </p>
                )}
              </div>
            )}

            {/* Episode filter — free: compact pill row */}
            {subscribed && contextTier === 'free' && (
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className="text-xs text-on-surface-dim">{s.podcast_page.notifications_label}</span>
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
                      ? 'bg-brand text-on-surface'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
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
                      ? 'bg-surface-container-high text-on-surface'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {s.podcast_page.filter_off}
                </button>
                <a href="/upgrade" className="text-xs text-on-surface-dim hover:text-primary transition-colors ml-1">
                  Pro: custom filters →
                </a>
              </div>
            )}

            {/* Custom filter modal */}
            <Dialog.Root open={filterModalOpen} onOpenChange={(o) => { if (!o) { setEpisodeFilter(subscription?.episode_filter ?? ''); setFilterModalOpen(false) } }}>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
                  <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
                    <Dialog.Title className="text-base font-semibold text-on-surface mb-1">{s.podcast_page.filter_modal_title}</Dialog.Title>
                    <Dialog.Description className="text-xs text-on-surface-variant mb-4">{s.podcast_page.filter_modal_description}</Dialog.Description>
                    <input
                      type="text"
                      value={episodeFilter}
                      onChange={(e) => setEpisodeFilter(e.target.value)}
                      placeholder="e.g. 90 Day, interview, recap..."
                      autoFocus
                      className="w-full bg-surface-container rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:ring-2 focus:ring-primary mb-4"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEpisodeFilter().then(() => setFilterModalOpen(false))
                      }}
                    />
                    <div className="flex gap-2">
                      <Dialog.Close asChild>
                        <button className="flex-1 py-2 rounded-lg text-sm bg-surface-container text-on-surface hover:text-on-surface transition-colors">
                          Cancel
                        </button>
                      </Dialog.Close>
                      <button
                        onClick={() => saveEpisodeFilter().then(() => setFilterModalOpen(false))}
                        disabled={savingFilter}
                        className="flex-1 py-2 rounded-lg text-sm font-medium bg-brand hover:bg-brand text-on-surface disabled:opacity-50 transition-colors"
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
                <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
                  <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
                    <Dialog.Title className="text-base font-semibold text-on-surface mb-1">{s.podcast_page.nav_warning_title}</Dialog.Title>
                    <Dialog.Description className="text-xs text-on-surface-variant mb-6">
                      {s.podcast_page.nav_warning_body.replace('{{n}}', String(unqueuedNewEpisodes.length))}
                    </Dialog.Description>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={queueAllAndLeave}
                        disabled={queuingAll}
                        className="w-full py-2 rounded-lg text-sm font-medium bg-brand hover:bg-brand text-on-surface disabled:opacity-50 transition-colors"
                      >
                        {queuingAll ? s.podcast_page.nav_warning_queuing : s.podcast_page.nav_warning_queue_and_leave}
                      </button>
                      <button
                        onClick={proceedWithNavigation}
                        disabled={queuingAll}
                        className="w-full py-2 rounded-lg text-sm bg-surface-container text-on-surface hover:text-on-surface disabled:opacity-40 transition-colors"
                      >
                        {s.podcast_page.nav_warning_leave}
                      </button>
                      <button
                        onClick={() => { setNavWarningOpen(false); pendingNavRef.current = null; isBeforeUnloadRef.current = false }}
                        disabled={queuingAll}
                        className="w-full py-2 rounded-lg text-sm bg-surface-container text-on-surface hover:text-on-surface disabled:opacity-40 transition-colors"
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-dim">
                    {s.podcast_page.search_results}{!itunesLoading && searchResults.length > 0 ? ` (${searchResults.length})` : ''}
                  </span>
                  <div className="flex-1 h-px bg-outline-variant/60" />
                  {itunesLoading && collectionId && (
                    <span className="text-xs text-on-surface-dim animate-pulse">{s.podcast_page.loading_more}</span>
                  )}
                  {searchTotalPages > 1 && (
                    <span className="text-xs text-on-surface-dim">{searchPage + 1} / {searchTotalPages}</span>
                  )}
                </div>
                {pagedSearchResults.length === 0 && itunesLoading ? (
                  <div className="space-y-1 mt-1">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
                  </div>
                ) : pagedSearchResults.length === 0 ? (
                  <p className="text-on-surface-dim text-sm py-8 text-center">No episodes found.</p>
                ) : (
                  pagedSearchResults.map((ep) => renderEpisodeRow(ep))
                )}
                {searchTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/60">
                    <button onClick={() => setSearchPage((p) => Math.max(0, p - 1))} disabled={searchPage === 0} className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                    <button onClick={() => setSearchPage((p) => Math.min(searchTotalPages - 1, p + 1))} disabled={searchPage === searchTotalPages - 1} className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* New episodes — flat rows with violet accent, no card wrapper */}
                {subscribed && newEpisodes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">New ✨</span>
                      <div className="flex-1 h-px bg-primary-container/40" />
                    </div>
                    {newEpisodes.map((ep) => renderEpisodeRow(ep, true))}
                  </div>
                )}

                {/* All episodes — flat list */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-dim">All Episodes</span>
                    <div className="flex-1 h-px bg-outline-variant/60" />
                    {/* Sort toggle */}
                    <button
                      onClick={() => {
                        const next = sortOrder === 'newest' ? 'oldest' : 'newest'
                        setSortOrder(next)
                        setEpisodePage(0)
                        if (feedUrl) localStorage.setItem(`podcast-sort-${feedUrl}`, next)
                      }}
                      className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-1.5 py-0.5 rounded"
                      title={sortOrder === 'newest' ? s.podcast_page.sort_newest : s.podcast_page.sort_oldest}
                    >
                      {sortOrder === 'newest' ? `${s.podcast_page.sort_newest} ↓` : `${s.podcast_page.sort_oldest} ↑`}
                    </button>
                    {/* Unplayed filter */}
                    <button
                      onClick={() => {
                        const next = !showUnplayedOnly
                        setShowUnplayedOnly(next)
                        setEpisodePage(0)
                        if (feedUrl) localStorage.setItem(`podcast-filter-${feedUrl}`, next ? 'unfinished' : 'all')
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded transition-colors ${showUnplayedOnly ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      {showUnplayedOnly ? s.podcast_page.filter_unplayed : s.podcast_page.filter_all}
                    </button>
                    <button
                      onClick={handleRefreshFeed}
                      disabled={loading}
                      title="Refresh episodes"
                      className="text-on-surface-variant hover:text-on-surface-variant disabled:opacity-30 transition-colors"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  {pagedEpisodes.map((ep) => renderEpisodeRow(ep))}
                  {(totalPages > 1 || (feed?.total && feed.episodes.length < feed.total)) && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/60">
                      <button onClick={() => setEpisodePage((p) => Math.max(0, p - 1))} disabled={episodePage === 0} className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                      <span className="text-xs text-on-surface-dim">{episodePage + 1} / {totalPages}</span>
                      <button
                        onClick={() => {
                          if (episodePage === totalPages - 1 && feed?.total && feed.episodes.length < feed.total) {
                            setEpisodeLimit((prev) => prev + 15)
                            setEpisodePage(0)
                          } else {
                            setEpisodePage((p) => Math.min(totalPages - 1, p + 1))
                          }
                        }}
                        disabled={episodePage === totalPages - 1 && !(feed?.total && feed.episodes.length < feed.total)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      ><ChevronRight size={16} /></button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Similar Podcasts */}
        {(similarLoading || similarPodcasts.length > 0) && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-dim">
                {s.podcast_page.similar_heading}
              </span>
              <div className="flex-1 h-px bg-outline-variant/60" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {similarLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonPodcastCard key={i} />)
                : similarPodcasts.map((p) => <PodcastCard key={p.collectionId} podcast={p} />)}
            </div>
          </div>
        )}

        {/* Dev-only: similar podcasts debug panel */}
        {process.env.NODE_ENV === 'development' && !similarLoading && similarDebug && (
          <details className="mt-6 rounded-lg border border-dashed border-outline-variant p-3 text-xs text-on-surface-variant">
            <summary className="cursor-pointer font-mono text-warning hover:text-warning">
              [dev] similar podcasts — {similarPodcasts.length} result{similarPodcasts.length !== 1 ? 's' : ''}
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-on-surface-variant">
              {JSON.stringify(similarDebug, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
