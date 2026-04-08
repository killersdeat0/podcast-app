'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { COMPLETION_THRESHOLD_PCT, LIVE_POSITION_INTERVAL_MS, isInProgress } from '@/lib/player/constants'
import AddToPlaylistPopover from '@/components/ui/AddToPlaylistPopover'
import { EpisodeProgressOverlay } from '@/components/ui/EpisodeProgressOverlay'
import { useUserPlaylists } from '@/hooks/useUserPlaylists'
import { addEpisodeToPlaylist } from '@/lib/playlists/addEpisodeToPlaylist'
import { Info } from 'lucide-react'
import DOMPurify from 'dompurify'

interface HistoryItem {
  episode_guid: string
  feed_url: string
  position_seconds: number
  position_pct: number | null
  completed: boolean
  updated_at: string
  episode: {
    title: string
    audio_url: string
    duration: number | null
    artwork_url: string | null
    podcast_title: string | null
    description: string | null
  } | null
}

interface DateGroup {
  label: string
  items: HistoryItem[]
}

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function progressPct(positionSeconds: number, duration: number | null, completed: boolean): number | null {
  if (completed) return 100
  if (!duration) return null
  return Math.min(100, Math.round((positionSeconds / duration) * 100))
}


function getCalendarDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function groupByDate(items: HistoryItem[]): DateGroup[] {
  const now = new Date()
  const todayKey = getCalendarDay(now)

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = getCalendarDay(yesterday)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)

  const buckets: Record<string, HistoryItem[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  }

  for (const item of items) {
    const d = new Date(item.updated_at)
    const key = getCalendarDay(d)
    if (key === todayKey) {
      buckets['Today'].push(item)
    } else if (key === yesterdayKey) {
      buckets['Yesterday'].push(item)
    } else if (d >= sevenDaysAgo) {
      buckets['This week'].push(item)
    } else {
      buckets['Earlier'].push(item)
    }
  }

  return (['Today', 'Yesterday', 'This week', 'Earlier'] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }))
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const { play, nowPlaying, playing, audioRef } = usePlayer()
  const [livePosition, setLivePosition] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const { isGuest } = useUser()
  const userPlaylists = useUserPlaylists(isGuest)
  const strings = useStrings()
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterParam = searchParams.get('filter')
  const showInProgress = filterParam === 'in_progress'

  const fetchHistory = useCallback(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .catch(() => {})
  }, [])

  // Optimistically reorder when a new episode starts playing (history-changed from play())
  const handleHistoryChanged = useCallback((e: Event) => {
    const guid = (e as CustomEvent<{ guid: string }>).detail?.guid
    if (!guid) return
    setItems((prev) => {
      const existing = prev.find((i) => i.episode_guid === guid)
      if (!existing) return prev // not in history yet — progress-saved re-fetch will handle it
      return [
        { ...existing, updated_at: new Date().toISOString() },
        ...prev.filter((i) => i.episode_guid !== guid),
      ]
    })
  }, [])

  // Update position in-place when progress is saved — avoids a full refetch that would
  // overwrite optimistic ordering from handleHistoryChanged. Falls back to a full refetch
  // only when the episode isn't in the list yet (first-time appearance in history).
  const handleProgressSaved = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ guid?: string; positionSeconds?: number; positionPct?: number | null; completed?: boolean }>).detail
    if (!detail?.guid) { fetchHistory(); return }
    const { guid, positionSeconds, positionPct, completed } = detail
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.episode_guid === guid)
      if (idx === -1) { fetchHistory(); return prev }
      return prev.map((item) =>
        item.episode_guid === guid
          ? {
              ...item,
              ...(positionSeconds !== undefined ? { position_seconds: positionSeconds } : {}),
              ...(positionPct !== undefined ? { position_pct: positionPct } : {}),
              ...(completed !== undefined ? { completed } : {}),
            }
          : item
      )
    })
  }, [fetchHistory])

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.addEventListener('history-changed', handleHistoryChanged)
    window.addEventListener('progress-saved', handleProgressSaved)
    return () => {
      window.removeEventListener('history-changed', handleHistoryChanged)
      window.removeEventListener('progress-saved', handleProgressSaved)
    }
  }, [handleHistoryChanged, handleProgressSaved])

  useLayoutEffect(() => {
    setLivePosition(0)
    setLiveDuration(0)
  }, [nowPlaying?.guid])

  useEffect(() => {
    const audio = audioRef.current
    if (!playing && audio && nowPlaying) {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nowPlaying) return
    const id = setInterval(() => {
      if (audioRef.current) {
        setLivePosition(audioRef.current.currentTime)
        setLiveDuration(audioRef.current.duration || 0)
      }
    }, LIVE_POSITION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [nowPlaying, audioRef])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !nowPlaying) return
    const onSeeked = () => {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
    audio.addEventListener('seeked', onSeeked)
    return () => audio.removeEventListener('seeked', onSeeked)
  }, [nowPlaying, audioRef])

  function playItem(item: HistoryItem) {
    if (!item.episode) return
    setItems((prev) => [
      { ...item, updated_at: new Date().toISOString() },
      ...prev.filter((i) => i.episode_guid !== item.episode_guid),
    ])
    play({
      guid: item.episode_guid,
      feedUrl: item.feed_url,
      title: item.episode.title,
      podcastTitle: item.episode.podcast_title ?? '',
      artworkUrl: item.episode.artwork_url ?? '',
      audioUrl: item.episode.audio_url,
      duration: item.episode.duration ?? 0,
      description: item.episode.description || undefined,
    })
  }

  function addToPlaylist(playlistId: string, item: HistoryItem): Promise<void> {
    if (!item.episode) return Promise.resolve()
    return addEpisodeToPlaylist(playlistId, {
      guid: item.episode_guid,
      feedUrl: item.feed_url,
      title: item.episode.title,
      audioUrl: item.episode.audio_url,
      artworkUrl: item.episode.artwork_url ?? '',
      podcastTitle: item.episode.podcast_title ?? '',
      duration: item.episode.duration ?? undefined,
    })
  }

  const [openDescGuid, setOpenDescGuid] = useState<string | null>(null)

  const inProgressItems = items.filter(isInProgress)
  const groups = groupByDate(items)

  function renderEpisodeRow(item: HistoryItem) {
    const isLoaded = nowPlaying?.guid === item.episode_guid
    const isPlaying = isLoaded && playing
    const posSeconds = isPlaying ? livePosition : item.position_seconds
    const livePct = isLoaded && liveDuration > 0 ? Math.min(100, Math.round((livePosition / liveDuration) * 100)) : null
    const pct = item.completed ? 100 : (livePct ?? item.position_pct ?? (isPlaying ? null : progressPct(posSeconds, item.episode?.duration ?? null, false)))
    const isPlayed = item.completed || (pct !== null && pct >= COMPLETION_THRESHOLD_PCT)
    const descOpen = openDescGuid === item.episode_guid
    const description = item.episode?.description ?? null
    return (
      <div key={item.episode_guid}>
        <div className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors overflow-hidden ${isPlaying ? 'bg-now-playing-surface' : 'bg-surface-container-low hover:bg-surface-container'}`}>
          <EpisodeProgressOverlay pct={pct} isPlaying={isPlaying} />
          <button
            onClick={() => playItem(item)}
            disabled={!item.episode}
            className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-50"
          >
            {item.episode?.artwork_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.episode.artwork_url}
                alt=""
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
            )}
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-on-surface truncate">
                {item.episode?.title ?? item.episode_guid}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.episode?.podcast_title && (
                  <span className="text-xs text-on-surface-variant truncate">{item.episode.podcast_title}</span>
                )}
                {item.episode?.duration && (
                  <span className="text-xs text-on-surface-dim">{formatDuration(item.episode.duration)}</span>
                )}
                {isPlayed && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">✓ Played</span>
                )}
              </div>
            </div>
          </button>
          {description && (
            <button
              onClick={() => setOpenDescGuid(descOpen ? null : item.episode_guid)}
              title="Show description"
              className={`p-2 transition ${descOpen ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-on-surface-dim hover:text-on-surface-variant'}`}
            >
              <Info className="w-4 h-4" />
            </button>
          )}
          {!isGuest && item.episode && (
            <AddToPlaylistPopover
              playlists={userPlaylists}
              onSelect={(playlistId) => addToPlaylist(playlistId, item)}
            />
          )}
        </div>
        {description && (
          <div className={`overflow-hidden transition-all duration-200 ease-in-out ${descOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
            <div
              className="pl-16 pr-4 pb-3 pt-1 text-sm text-on-surface-variant [&_a]:text-primary [&_a]:underline [&_p]:mb-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
            />
          </div>
        )}
      </div>
    )
  }

  const pillClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-sm font-medium transition-colors ${active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{strings.history.heading}</h1>
        <div className="flex gap-1">
          <button className={pillClass(!showInProgress)} onClick={() => router.push('/history')}>
            {strings.history.filter_all}
          </button>
          <button className={pillClass(showInProgress)} onClick={() => router.push('/history?filter=in_progress')}>
            {strings.history.filter_in_progress}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : showInProgress ? (
        inProgressItems.length === 0 ? (
          <EmptyState
            title={strings.history.in_progress_empty_title}
            description={strings.history.in_progress_empty_description}
          />
        ) : (
          <div className="space-y-2">
            {inProgressItems.map((item) => renderEpisodeRow(item))}
          </div>
        )
      ) : items.length === 0 ? (
        <EmptyState
          title={strings.history.empty_title}
          description={strings.history.empty_description}
          cta={{ label: strings.history.empty_cta, href: '/discover' }}
        />
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mt-6 mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant px-1">
                  {group.label} · {group.items.length} {group.items.length === 1 ? 'episode' : 'episodes'}
                </h2>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => renderEpisodeRow(item))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
