'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { usePlayer } from '@/components/player/PlayerContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { COMPLETION_THRESHOLD_PCT, LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'
import AddToPlaylistPopover from '@/components/ui/AddToPlaylistPopover'
import { EpisodeProgressOverlay } from '@/components/ui/EpisodeProgressOverlay'
import { useUserPlaylists } from '@/hooks/useUserPlaylists'
import { addEpisodeToPlaylist } from '@/lib/playlists/addEpisodeToPlaylist'

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
  } | null
}

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatProgress(positionSeconds: number, duration: number | null) {
  if (!duration) return formatDuration(positionSeconds) + ' played'
  const pct = Math.min(100, Math.round((positionSeconds / duration) * 100))
  return `${pct}%`
}

function progressPct(positionSeconds: number, duration: number | null, completed: boolean): number | null {
  if (completed) return 100
  if (!duration) return null
  return Math.min(100, Math.round((positionSeconds / duration) * 100))
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

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.history.heading}</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={strings.history.empty_title}
          description={strings.history.empty_description}
          cta={{ label: strings.history.empty_cta, href: '/discover' }}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isPlaying = nowPlaying?.guid === item.episode_guid
            const posSeconds = isPlaying ? livePosition : item.position_seconds
            const livePct = isPlaying && liveDuration > 0 ? Math.min(100, Math.round((livePosition / liveDuration) * 100)) : null
            const pct = item.completed ? 100 : (livePct ?? item.position_pct ?? (isPlaying ? null : progressPct(posSeconds, item.episode?.duration ?? null, false)))
            return (
            <div key={item.episode_guid} className="group relative flex items-center gap-1">
              <button
                onClick={() => playItem(item)}
                disabled={!item.episode}
                className={`relative flex-1 flex items-center gap-3 text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-50 overflow-hidden ${isPlaying ? 'bg-now-playing-surface hover:bg-now-playing-surface' : 'bg-surface-container-low hover:bg-surface-container'}`}
              >
                <EpisodeProgressOverlay pct={pct} isPlaying={isPlaying} />
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
                  <div className="flex gap-2 mt-0.5">
                    {item.episode?.podcast_title && (
                      <span className="text-xs text-on-surface-variant truncate">{item.episode.podcast_title}</span>
                    )}
                    {item.episode?.duration && (
                      <span className="text-xs text-on-surface-dim">{formatDuration(item.episode.duration)}</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {(item.completed || (pct !== null && pct >= COMPLETION_THRESHOLD_PCT)) ? (
                    <span className="text-xs text-playback-indicator">Done</span>
                  ) : (
                    <span className="text-xs text-on-surface-dim">
                      {pct !== null ? `${pct}%` : formatProgress(posSeconds, item.episode?.duration ?? null)}
                    </span>
                  )}
                  <p className="text-xs text-on-surface-dim mt-0.5">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
              {!isGuest && userPlaylists.length > 0 && item.episode && (
                <AddToPlaylistPopover
                  playlists={userPlaylists}
                  onSelect={(playlistId) => addToPlaylist(playlistId, item)}
                />
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
