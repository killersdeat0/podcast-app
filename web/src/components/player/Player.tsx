'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Volume1, Volume2, VolumeX, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { usePlayer, NowPlaying, PlaylistEpisodeRef } from './PlayerContext'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { COMPLETION_THRESHOLD_PCT } from '@/lib/player/constants'
import { ALL_SPEEDS, FREE_SPEEDS, GLOBAL_SPEED_KEY, resolveEpisodeSpeed } from '@/lib/player/speed'

interface Chapter {
  startTime: number
  title?: string
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function Player({ isFreeTier = false }: { isFreeTier?: boolean }) {
  const { nowPlaying, playing, speed, play, togglePlay, seek, setSpeed, audioRef, clientQueue, prependClient, dequeueClient, updatePlaylistEpisodes } = usePlayer()
  const { isGuest } = useUser()
  const availableSpeeds = isFreeTier ? FREE_SPEEDS : ALL_SPEEDS
  const strings = useStrings()

  const seekBack = useCallback(() => {
    if (audioRef.current) seek(audioRef.current.currentTime - 15)
  }, [audioRef, seek])
  const seekForward = useCallback(() => {
    if (audioRef.current) seek(audioRef.current.currentTime + 30)
  }, [audioRef, seek])
  useKeyboardShortcuts({ togglePlay, seekBack, seekForward })
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [volume, setVolume] = useState(1)
  const [artworkError, setArtworkError] = useState(false)
  const [mobileMenu, setMobileMenu] = useState<null | 'main' | 'speed' | 'volume'>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [dbQueue, setDbQueue] = useState<Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }>>([])

  const refreshDbQueue = useCallback(() => {
    if (isGuest) return
    fetch('/api/queue')
      .then((r) => r.json())
      .then((items) => { if (Array.isArray(items)) setDbQueue(items) })
      .catch(() => {})
  }, [isGuest])

  useEffect(() => {
    if (!nowPlaying) return
    refreshDbQueue()
  }, [nowPlaying, refreshDbQueue])

  useEffect(() => {
    if (isGuest) return
    window.addEventListener('queue-changed', refreshDbQueue)
    return () => window.removeEventListener('queue-changed', refreshDbQueue)
  }, [isGuest, refreshDbQueue])

  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEscapeKey(() => setMobileMenu(null), !!mobileMenu)

  useEffect(() => {
    if (!isFreeTier) {
      const stored = localStorage.getItem('playback-speed')
      if (stored) setSpeed(Number(stored))
    }
    const storedVolume = localStorage.getItem('playback-volume')
    if (storedVolume) setVolume(Number(storedVolume))
  }, [isFreeTier]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume, audioRef])

  useEffect(() => {
    function onVolumeChanged(e: Event) {
      const v = (e as CustomEvent<{ volume: number }>).detail.volume
      if (!isNaN(v)) setVolume(v)
    }
    window.addEventListener('volume-changed', onVolumeChanged)
    return () => window.removeEventListener('volume-changed', onVolumeChanged)
  }, [])


  function handleSetSpeed(s: number) {
    setSpeed(s)
  }

  function handleSetVolume(v: number) {
    setVolume(v)
    localStorage.setItem('playback-volume', String(v))
  }
  const lastSavedAt = useRef(0)
  const nowPlayingRef = useRef(nowPlaying)
  const prevNowPlayingRef = useRef<NowPlaying | null>(null)
  const playingRef = useRef(playing)
  const clientQueueRef = useRef(clientQueue)
  const isDragging = useRef(false)
  const hasCompletedRef = useRef(false)
  const previousEpisodeRef = useRef<{ episode: NowPlaying; positionSeconds: number; source: 'queue' | 'playlist' | 'guest' } | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const [sliderValue, setSliderValue] = useState(0)

  useEffect(() => {
    nowPlayingRef.current = nowPlaying
    playingRef.current = playing
    clientQueueRef.current = clientQueue
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const { playlistId } = (e as CustomEvent<{ playlistId: string }>).detail
      const current = nowPlayingRef.current
      if (!current?.playlistContext || current.playlistContext.playlistId !== playlistId) return
      fetch(`/api/playlists/${playlistId}`)
        .then((r) => r.json())
        .then(({ episodes: rawEps }: { episodes: Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }> }) => {
          if (!Array.isArray(rawEps)) return
          const freshEpisodes: PlaylistEpisodeRef[] = rawEps
            .filter((pe) => pe.episode)
            .map((pe) => ({
              guid: pe.episode_guid,
              feedUrl: pe.feed_url,
              title: pe.episode!.title,
              podcastTitle: pe.episode!.podcast_title ?? '',
              artworkUrl: pe.episode!.artwork_url ?? '',
              audioUrl: pe.episode!.audio_url,
              duration: pe.episode!.duration ?? 0,
            }))
          updatePlaylistEpisodes(freshEpisodes)
        })
        .catch(() => {})
    }
    window.addEventListener('playlist-episodes-changed', handler)
    return () => window.removeEventListener('playlist-episodes-changed', handler)
  }, [updatePlaylistEpisodes])

  useEffect(() => {
    setArtworkError(false)
    setChapters([])
    if (nowPlaying?.chapterUrl) {
      fetch(`/api/podcasts/chapters?url=${encodeURIComponent(nowPlaying.chapterUrl)}`)
        .then((r) => r.json())
        .then(({ chapters: ch }) => setChapters(ch ?? []))
        .catch(() => {})
    }
  }, [nowPlaying])

  // Sync audio element when nowPlaying changes + restore saved position
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !nowPlaying) return

    // Save position of the episode we're switching away from (before src changes)
    const prev = prevNowPlayingRef.current
    if (!isGuest && prev && prev.guid !== nowPlaying.guid && audio.currentTime > 5 && !hasCompletedRef.current) {
      // Capture position now — audio.src changes below and currentTime resets
      const savedSeconds = Math.floor(audio.currentTime)
      const savedPct = audio.duration > 0 ? Math.min(100, Math.round((audio.currentTime / audio.duration) * 100)) : null
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: prev.guid,
          feedUrl: prev.feedUrl,
          positionSeconds: savedSeconds,
          positionPct: savedPct ?? undefined,
          completed: false,
          title: prev.title,
          audioUrl: prev.audioUrl,
          duration: prev.duration,
          artworkUrl: prev.artworkUrl,
          podcastTitle: prev.podcastTitle,
        }),
      })
        .then(() => window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid: prev.guid, positionSeconds: savedSeconds, positionPct: savedPct, completed: false } })))
        .catch(() => {})
    }
    prevNowPlayingRef.current = nowPlaying

    audio.src = nowPlaying.audioUrl

    // Apply per-show speed preference, falling back to the stored global default.
    // Use the localStorage value (not the current `speed` state) so that switching
    // away from a fast podcast doesn't carry its speed to a show with no preference.
    const storedGlobal = Number(localStorage.getItem(GLOBAL_SPEED_KEY)) || speed
    const resolvedSpeed = resolveEpisodeSpeed(nowPlaying.feedUrl, storedGlobal, isFreeTier)
    if (resolvedSpeed !== speed) setSpeed(resolvedSpeed)
    audio.playbackRate = resolvedSpeed
    setCurrentTime(0)
    hasCompletedRef.current = false
    lastSavedAt.current = 0

    // Check for a pending undo seek (restore previous position) — takes priority over DB progress
    const pendingSeek = pendingSeekRef.current
    pendingSeekRef.current = null

    if (isGuest) {
      if (playingRef.current) audio.play().catch(() => {})
    } else if (pendingSeek !== null) {
      // Undo restore: seek to saved position once the audio can play
      const applySeek = () => {
        if (pendingSeek > 5) audio.currentTime = pendingSeek
        if (playingRef.current) audio.play().catch(() => {})
        audio.removeEventListener('canplay', applySeek)
      }
      audio.addEventListener('canplay', applySeek)
    } else {
      fetch(`/api/progress?guid=${encodeURIComponent(nowPlaying.guid)}&feedUrl=${encodeURIComponent(nowPlaying.feedUrl)}`)
        .then((r) => r.json())
        .then(({ positionSeconds }) => {
          if (positionSeconds > 5) audio.currentTime = positionSeconds
          if (playingRef.current) audio.play().catch(() => {})
        })
        .catch(() => { if (playingRef.current) audio.play().catch(() => {}) })
    }
  }, [nowPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  const restorePreviousEpisode = useCallback(() => {
    const prev = previousEpisodeRef.current
    if (!prev) return
    previousEpisodeRef.current = null
    pendingSeekRef.current = prev.positionSeconds
    play(prev.episode)
    // Re-add to the front of whichever queue it came from
    if (prev.source === 'queue') {
      fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: prev.episode.guid,
          feedUrl: prev.episode.feedUrl,
          title: prev.episode.title,
          audioUrl: prev.episode.audioUrl,
          artworkUrl: prev.episode.artworkUrl,
          podcastTitle: prev.episode.podcastTitle,
          duration: prev.episode.duration,
          prepend: true,
        }),
      })
        .then(() => window.dispatchEvent(new Event('queue-changed')))
        .catch(() => {})
    } else if (prev.source === 'guest') {
      prependClient(prev.episode)
    }
  }, [play, prependClient])

  // Fetch fresh playlist order and advance to the episode after np.guid
  const advancePlaylist = useCallback((playlistId: string, currentGuid: string) => {
    fetch(`/api/playlists/${playlistId}`)
      .then((r) => r.json())
      .then(({ episodes: rawEps }: { episodes: Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }> }) => {
        if (!Array.isArray(rawEps)) return
        const freshEpisodes: PlaylistEpisodeRef[] = rawEps
          .filter((pe) => pe.episode)
          .map((pe) => ({
            guid: pe.episode_guid,
            feedUrl: pe.feed_url,
            title: pe.episode!.title,
            podcastTitle: pe.episode!.podcast_title ?? '',
            artworkUrl: pe.episode!.artwork_url ?? '',
            audioUrl: pe.episode!.audio_url,
            duration: pe.episode!.duration ?? 0,
          }))
        const idx = freshEpisodes.findIndex((e) => e.guid === currentGuid)
        const next = freshEpisodes[idx + 1]
        if (next) {
          play({ ...next, playlistContext: { playlistId, episodes: freshEpisodes } })
        }
      })
      .catch(() => {})
  }, [play])

  const skipToNext = useCallback((np: NowPlaying) => {
    const audio = audioRef.current
    // Only offer undo if the episode isn't almost done (< 95% played)
    const pctPlayed = audio && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0
    if (pctPlayed < 95) {
      previousEpisodeRef.current = {
        episode: np,
        positionSeconds: Math.floor(audio?.currentTime ?? 0),
        source: np.playlistContext ? 'playlist' : 'queue',
      }
    } else {
      previousEpisodeRef.current = null
    }

    // Save current position without marking complete so the user can resume
    if (audio && audio.currentTime > 5) {
      const pct = audio.duration > 0 ? Math.min(100, Math.round((audio.currentTime / audio.duration) * 100)) : undefined
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: np.guid,
          feedUrl: np.feedUrl,
          positionSeconds: Math.floor(audio.currentTime),
          positionPct: pct,
          completed: false,
          title: np.title,
          audioUrl: np.audioUrl,
          duration: np.duration,
          artworkUrl: np.artworkUrl,
          podcastTitle: np.podcastTitle,
        }),
      }).catch(() => {})
    }

    // Playlist context: fetch fresh order, advance non-destructively (don't touch queue)
    if (np.playlistContext) {
      advancePlaylist(np.playlistContext.playlistId, np.guid)
      if (previousEpisodeRef.current) {
        toast('Playing next episode', {
          duration: 5000,
          action: { label: 'Undo', onClick: () => restorePreviousEpisode() },
        })
      }
      return
    }

    // Queue logic (existing)
    fetch('/api/queue')
      .then((r) => r.json())
      .then((items: Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }>) => {
        if (!Array.isArray(items)) return
        const idx = items.findIndex((i) => i.episode_guid === np.guid)
        fetch('/api/queue', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guid: np.guid }),
        })
          .then(() => window.dispatchEvent(new Event('queue-changed')))
          .catch(() => {})
        const next = items[idx + 1]
        if (next?.episode) {
          play({
            guid: next.episode_guid,
            feedUrl: next.feed_url,
            title: next.episode.title,
            podcastTitle: next.episode.podcast_title ?? '',
            artworkUrl: next.episode.artwork_url ?? '',
            audioUrl: next.episode.audio_url,
            duration: next.episode.duration ?? 0,
          })
          toast('Playing next episode', {
            duration: 5000,
            action: { label: 'Undo', onClick: () => restorePreviousEpisode() },
          })
        } else {
          // No next episode — clear the snapshot so undo isn't offered
          previousEpisodeRef.current = null
        }
      })
      .catch(() => {})
  }, [audioRef, play, advancePlaylist, restorePreviousEpisode])

  const completeAndAdvance = useCallback((np: NowPlaying) => {
    const audio = audioRef.current
    // Auto-advance on completion — no undo offered (episode naturally finished)
    previousEpisodeRef.current = null

    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guid: np.guid,
        feedUrl: np.feedUrl,
        positionSeconds: Math.floor(audio?.currentTime || audio?.duration || 0),
        positionPct: 100,
        completed: true,
        title: np.title,
        audioUrl: np.audioUrl,
        duration: np.duration,
        artworkUrl: np.artworkUrl,
        podcastTitle: np.podcastTitle,
      }),
    })
      .then(() => window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid: np.guid, positionPct: 100, completed: true } })))
      .catch(() => {})

    // TODO: play audio ad clip here for free tier before advancing

    // Playlist context: fetch fresh order, advance non-destructively (don't touch queue).
    // But if the completed episode was also queued, remove it so it doesn't replay.
    if (np.playlistContext) {
      fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid: np.guid }),
      })
        .then(() => window.dispatchEvent(new Event('queue-changed')))
        .catch(() => {})
      advancePlaylist(np.playlistContext.playlistId, np.guid)
      return
    }

    // Queue logic (existing)
    fetch('/api/queue')
      .then((r) => r.json())
      .then((items: Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }>) => {
        if (!Array.isArray(items)) return
        const idx = items.findIndex((i) => i.episode_guid === np.guid)
        fetch('/api/queue', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guid: np.guid }),
        })
          .then(() => window.dispatchEvent(new Event('queue-changed')))
          .catch(() => {})
        const next = items[idx + 1]
        if (next?.episode) {
          play({
            guid: next.episode_guid,
            feedUrl: next.feed_url,
            title: next.episode.title,
            podcastTitle: next.episode.podcast_title ?? '',
            artworkUrl: next.episode.artwork_url ?? '',
            audioUrl: next.episode.audio_url,
            duration: next.episode.duration ?? 0,
          })
        }
      })
      .catch(() => {})
  }, [audioRef, play, advancePlaylist, restorePreviousEpisode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      if (!isDragging.current) setCurrentTime(audio.currentTime)
      const now = Date.now()
      const np = nowPlayingRef.current
      if (!isGuest && np && audio.duration > 0 && !hasCompletedRef.current) {
        const pct = (audio.currentTime / audio.duration) * 100
        if (pct >= COMPLETION_THRESHOLD_PCT) {
          // Mark complete in DB so the "Done" indicator appears, but keep playing —
          // auto-advance happens in onEnded when the audio actually finishes.
          hasCompletedRef.current = true
          const savedSeconds = Math.floor(audio.currentTime)
          fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guid: np.guid,
              feedUrl: np.feedUrl,
              positionSeconds: savedSeconds,
              positionPct: 100,
              completed: true,
              title: np.title,
              audioUrl: np.audioUrl,
              duration: np.duration,
              artworkUrl: np.artworkUrl,
              podcastTitle: np.podcastTitle,
            }),
          })
            .then(() => window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid: np.guid, positionPct: 100, completed: true } })))
            .catch(() => {})
        }
      }
      if (!isGuest && np && audio.currentTime > 5 && now - lastSavedAt.current > 10000 && !hasCompletedRef.current) {
        lastSavedAt.current = now
        // Capture position before the async fetch — currentTime advances while the request is in-flight
        const savedSeconds = Math.floor(audio.currentTime)
        const savedPct = audio.duration > 0 ? Math.min(100, Math.round((audio.currentTime / audio.duration) * 100)) : null
        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guid: np.guid,
            feedUrl: np.feedUrl,
            positionSeconds: savedSeconds,
            positionPct: savedPct ?? undefined,
            title: np.title,
            audioUrl: np.audioUrl,
            duration: np.duration,
            artworkUrl: np.artworkUrl,
            podcastTitle: np.podcastTitle,
          }),
        })
          .then(() => window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid: np.guid, positionSeconds: savedSeconds, positionPct: savedPct, completed: false } })))
          .catch(() => {})
      }
    }

    const onDuration = () => setDuration(audio.duration)

    const onEnded = () => {
      const np = nowPlayingRef.current
      if (!np) return

      if (isGuest) {
        const queue = clientQueueRef.current
        const idx = queue.findIndex((e) => e.guid === np.guid)
        dequeueClient(np.guid)
        const next = queue[idx + 1] ?? queue[0]
        if (next && next.guid !== np.guid) {
          play(next)
        }
        return
      }

      // completeAndAdvance is only called here — 98% threshold saves completed:true but doesn't advance
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true
        completeAndAdvance(np)
      }
    }

    const onSeeked = () => {
      const np = nowPlayingRef.current
      if (!np || isGuest || !hasCompletedRef.current || !audio.duration) return
      const pct = (audio.currentTime / audio.duration) * 100
      if (pct < COMPLETION_THRESHOLD_PCT) {
        // Reset so the next 10s interval save persists completed:false to DB
        hasCompletedRef.current = false
        const savedPct = Math.round(pct)
        window.dispatchEvent(new CustomEvent('progress-saved', { detail: { guid: np.guid, positionSeconds: Math.floor(audio.currentTime), positionPct: savedPct, completed: false } }))
      }
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('seeked', onSeeked)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [audioRef, play, isGuest, dequeueClient, restorePreviousEpisode])

  function startSleepTimer(minutes: number) {
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    setSleepMinutes(minutes)
    if (minutes === 0) return
    sleepTimer.current = setTimeout(() => {
      audioRef.current?.pause()
      setSleepMinutes(0)
    }, minutes * 60 * 1000)
  }

  const hasNextInQueue = (() => {
    if (isGuest) {
      const idx = clientQueue.findIndex((e) => e.guid === nowPlaying?.guid)
      return idx !== -1 && idx < clientQueue.length - 1
    }
    // Check playlist context first
    if (nowPlaying?.playlistContext) {
      const { episodes } = nowPlaying.playlistContext
      const idx = episodes.findIndex((e) => e.guid === nowPlaying.guid)
      return idx !== -1 && idx < episodes.length - 1
    }
    const idx = dbQueue.findIndex((e) => e.episode_guid === nowPlaying?.guid)
    return idx !== -1 && idx < dbQueue.length - 1
  })()

  return (
    <>
      <audio ref={audioRef} preload="metadata" />
      {!nowPlaying ? null : (
    <div className="bg-surface-container-low border-t border-outline-variant px-3 md:px-6 py-3 flex-shrink-0">

      <div className="max-w-screen-xl mx-auto flex items-center gap-3 md:gap-6">
        {/* Artwork + info */}
        <div className="flex items-center gap-3 min-w-0 flex-shrink max-w-[40%] md:max-w-none md:w-56 md:flex-shrink-0">
          {nowPlaying.artworkUrl && !artworkError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.artworkUrl}
              alt=""
              className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-cover flex-shrink-0"
              onError={() => setArtworkError(true)}
            />
          )}
          <div className="overflow-hidden min-w-0 hidden sm:block">
            <p className="text-sm font-medium text-on-surface truncate">{nowPlaying.title}</p>
            <p className="text-xs text-on-surface-variant truncate">{nowPlaying.podcastTitle}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-4">
            <button onClick={() => seek(currentTime - 15)} className="text-on-surface-variant hover:text-on-surface text-sm">-15</button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-brand hover:bg-brand-dark flex items-center justify-center text-on-surface transition-colors"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button onClick={() => seek(currentTime + 30)} className="text-on-surface-variant hover:text-on-surface text-sm">+30</button>
            {hasNextInQueue && (
              <button
                onClick={() => {
                  const np = nowPlayingRef.current
                  if (np) skipToNext(np)
                }}
                title="Next episode"
                className="text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 w-full max-w-lg">
            <span className="text-xs text-on-surface-dim w-10 text-right">{formatTime(currentTime)}</span>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                // eslint-disable-next-line react-hooks/refs -- ref read during render is intentional: using state would cause unwanted re-renders while dragging
                value={isDragging.current ? sliderValue : currentTime}
                onPointerDown={() => { isDragging.current = true; setSliderValue(currentTime) }}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                onPointerUp={(e) => { isDragging.current = false; seek(Number(e.currentTarget.value)) }}
                className="w-full accent-brand"
              />
              {duration > 0 && chapters.map((ch) => (
                <div
                  key={ch.startTime}
                  title={ch.title}
                  onClick={() => seek(ch.startTime)}
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-primary/70 rounded-full cursor-pointer pointer-events-auto"
                  style={{ left: `${(ch.startTime / duration) * 100}%` }}
                />
              ))}
            </div>
            <span className="text-xs text-on-surface-dim w-10">{formatTime(duration)}</span>
          </div>
          {chapters.length > 0 && (() => {
            const current = [...chapters].reverse().find((ch) => ch.startTime <= currentTime)
            return current?.title ? (
              <p className="text-xs text-on-surface-variant truncate max-w-lg">{current.title}</p>
            ) : null
          })()}
        </div>

        {/* Mobile menu */}
        <div className="relative md:hidden flex-shrink-0">
          <button
            onClick={() => setMobileMenu('main')}
            className="text-on-surface-variant hover:text-on-surface px-1 py-1 text-lg leading-none"
            aria-label="More options"
          >
            ···
          </button>
          {mobileMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMobileMenu(null)} />
              <div className="absolute bottom-full right-0 mb-2 bg-surface-container border border-outline-variant rounded-lg overflow-hidden z-20 min-w-[160px]">
                {mobileMenu === 'main' && (
                  <>
                    <button
                      onClick={() => setMobileMenu('speed')}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high"
                    >
                      <span>{strings.player.playback_speed}</span>
                      <span className="text-on-surface-variant ml-4">{speed}x ›</span>
                    </button>
                    <button
                      onClick={() => setMobileMenu('volume')}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high"
                    >
                      <span>{strings.player.volume}</span>
                      <span className="text-on-surface-variant ml-4">{Math.round(volume * 100)}% ›</span>
                    </button>
                  </>
                )}
                {mobileMenu === 'volume' && (
                  <>
                    <button
                      onClick={() => setMobileMenu('main')}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container-high border-b border-outline-variant"
                    >
                      <span>‹</span> {strings.player.volume}
                    </button>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <button
                        onClick={() => handleSetVolume(volume === 0 ? 1 : 0)}
                        className="text-on-surface-variant hover:text-on-surface flex-shrink-0"
                      >
                        {volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => handleSetVolume(Number(e.target.value))}
                        className="flex-1 accent-brand"
                      />
                    </div>
                  </>
                )}
                {mobileMenu === 'speed' && (
                  <>
                    <button
                      onClick={() => setMobileMenu('main')}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container-high border-b border-outline-variant"
                    >
                      <span>‹</span> {strings.player.playback_speed}
                    </button>
                    {availableSpeeds.map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleSetSpeed(s); setMobileMenu(null) }}
                        className={`w-full text-left px-4 py-2.5 text-sm ${speed === s ? 'text-primary font-semibold' : 'text-on-surface hover:bg-surface-container-high'}`}
                      >
                        {s}x
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Speed + Sleep timer + Volume */}
        <div className="hidden md:flex flex-col items-start gap-0.5 w-56 justify-end flex-shrink-0">
          <div className="flex items-center gap-2">
            <select
              value={availableSpeeds.includes(speed) ? speed : availableSpeeds[availableSpeeds.length - 1]}
              onChange={(e) => handleSetSpeed(Number(e.target.value))}
              className="bg-surface-container text-on-surface text-xs rounded px-2 py-1 outline-none"
            >
              {availableSpeeds.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
            <select
              value={sleepMinutes}
              onChange={(e) => startSleepTimer(Number(e.target.value))}
              className="bg-surface-container text-on-surface text-xs rounded px-2 py-1 outline-none"
            >
              <option value={0}>{strings.player.sleep_off}</option>
              <option value={5}>{strings.player.sleep_5}</option>
              <option value={10}>{strings.player.sleep_10}</option>
              <option value={15}>{strings.player.sleep_15}</option>
              <option value={30}>{strings.player.sleep_30}</option>
              <option value={45}>{strings.player.sleep_45}</option>
              <option value={60}>{strings.player.sleep_60}</option>
            </select>
            <button
              onClick={() => handleSetVolume(volume === 0 ? 1 : 0)}
              className="text-on-surface-variant hover:text-on-surface flex-shrink-0"
              aria-label={strings.player.volume}
            >
              {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : volume < 0.5 ? <Volume1 className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => handleSetVolume(Number(e.target.value))}
              className="w-16 accent-brand"
              aria-label={strings.player.volume}
            />
          </div>
          {isFreeTier && (
            <a href="/upgrade" className="text-[10px] text-primary hover:text-primary leading-none whitespace-nowrap">
              {strings.player.upgrade_for_speeds}
            </a>
          )}
        </div>
      </div>
    </div>
      )}
    </>
  )
}
