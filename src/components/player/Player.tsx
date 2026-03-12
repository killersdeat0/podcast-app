'use client'

import { useEffect, useRef, useState } from 'react'
import { usePlayer } from './PlayerContext'

const ALL_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const FREE_SPEEDS = [1, 2]

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
  const { nowPlaying, playing, speed, play, togglePlay, seek, setSpeed, audioRef } = usePlayer()
  const availableSpeeds = isFreeTier ? FREE_SPEEDS : ALL_SPEEDS
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [artworkError, setArtworkError] = useState(false)
  const [mobileMenu, setMobileMenu] = useState<null | 'main' | 'speed'>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isFreeTier) {
      const stored = localStorage.getItem('playback-speed')
      if (stored) setSpeed(Number(stored))
    }
  }, [isFreeTier]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSetSpeed(s: number) {
    setSpeed(s)
    if (!isFreeTier) localStorage.setItem('playback-speed', String(s))
  }
  const lastSavedAt = useRef(0)
  const nowPlayingRef = useRef(nowPlaying)
  const playingRef = useRef(playing)

  useEffect(() => {
    nowPlayingRef.current = nowPlaying
    playingRef.current = playing
  })

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
    audio.src = nowPlaying.audioUrl
    audio.playbackRate = speed
    setCurrentTime(0)

    fetch(`/api/progress?guid=${encodeURIComponent(nowPlaying.guid)}&feedUrl=${encodeURIComponent(nowPlaying.feedUrl)}`)
      .then((r) => r.json())
      .then(({ positionSeconds }) => {
        if (positionSeconds > 5) audio.currentTime = positionSeconds
        if (playingRef.current) audio.play().catch(() => {})
      })
      .catch(() => { if (playingRef.current) audio.play().catch(() => {}) })
  }, [nowPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      setCurrentTime(audio.currentTime)
      const now = Date.now()
      const np = nowPlayingRef.current
      if (np && audio.currentTime > 5 && now - lastSavedAt.current > 10000) {
        lastSavedAt.current = now
        fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guid: np.guid,
            feedUrl: np.feedUrl,
            positionSeconds: Math.floor(audio.currentTime),
            title: np.title,
            audioUrl: np.audioUrl,
            duration: np.duration,
            artworkUrl: np.artworkUrl,
            podcastTitle: np.podcastTitle,
          }),
        }).catch(() => {})
      }
    }

    const onDuration = () => setDuration(audio.duration)

    const onEnded = () => {
      const np = nowPlayingRef.current
      if (!np) return

      // Mark completed
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: np.guid,
          feedUrl: np.feedUrl,
          positionSeconds: Math.floor(audio.duration || 0),
          completed: true,
          title: np.title,
          audioUrl: np.audioUrl,
          duration: np.duration,
          artworkUrl: np.artworkUrl,
          podcastTitle: np.podcastTitle,
        }),
      }).catch(() => {})

      // TODO: play audio ad clip here for free tier before advancing

      // Remove from queue and play next
      fetch('/api/queue')
        .then((r) => r.json())
        .then((items: Array<{ episode_guid: string; feed_url: string; episode: { title: string; audio_url: string; duration: number | null; artwork_url: string | null; podcast_title: string | null } | null }>) => {
          if (!Array.isArray(items)) return
          const idx = items.findIndex((i) => i.episode_guid === np.guid)
          // Remove current from queue
          fetch('/api/queue', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guid: np.guid }),
          }).catch(() => {})
          // Play next if available
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
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioRef, play])

  function startSleepTimer(minutes: number) {
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    setSleepMinutes(minutes)
    if (minutes === 0) return
    sleepTimer.current = setTimeout(() => {
      audioRef.current?.pause()
      setSleepMinutes(0)
    }, minutes * 60 * 1000)
  }

  return (
    <>
      <audio ref={audioRef} preload="metadata" />
      {!nowPlaying ? null : (
    <div className="bg-gray-900 border-t border-gray-800 px-3 md:px-6 py-3 flex-shrink-0">

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
            <p className="text-sm font-medium text-white truncate">{nowPlaying.title}</p>
            <p className="text-xs text-gray-400 truncate">{nowPlaying.podcastTitle}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-4">
            <button onClick={() => seek(currentTime - 15)} className="text-gray-400 hover:text-white text-sm">-15</button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white transition-colors"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button onClick={() => seek(currentTime + 30)} className="text-gray-400 hover:text-white text-sm">+30</button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-lg">
            <span className="text-xs text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              {duration > 0 && chapters.map((ch) => (
                <div
                  key={ch.startTime}
                  title={ch.title}
                  onClick={() => seek(ch.startTime)}
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-violet-300/70 rounded-full cursor-pointer pointer-events-auto"
                  style={{ left: `${(ch.startTime / duration) * 100}%` }}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
          </div>
          {chapters.length > 0 && (() => {
            const current = [...chapters].reverse().find((ch) => ch.startTime <= currentTime)
            return current?.title ? (
              <p className="text-xs text-gray-500 truncate max-w-lg">{current.title}</p>
            ) : null
          })()}
        </div>

        {/* Mobile menu */}
        <div className="relative md:hidden flex-shrink-0">
          <button
            onClick={() => setMobileMenu('main')}
            className="text-gray-400 hover:text-white px-1 py-1 text-lg leading-none"
            aria-label="More options"
          >
            ···
          </button>
          {mobileMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMobileMenu(null)} />
              <div className="absolute bottom-full right-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden z-20 min-w-[160px]">
                {mobileMenu === 'main' && (
                  <button
                    onClick={() => setMobileMenu('speed')}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700"
                  >
                    <span>Playback Speed</span>
                    <span className="text-gray-500 ml-4">{speed}x ›</span>
                  </button>
                )}
                {mobileMenu === 'speed' && (
                  <>
                    <button
                      onClick={() => setMobileMenu('main')}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-700 border-b border-gray-700"
                    >
                      <span>‹</span> Playback Speed
                    </button>
                    {availableSpeeds.map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleSetSpeed(s); setMobileMenu(null) }}
                        className={`w-full text-left px-4 py-2.5 text-sm ${speed === s ? 'text-violet-400 font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}
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

        {/* Speed + Sleep timer */}
        <div className="hidden md:flex items-center gap-3 w-48 justify-end flex-shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <select
              value={availableSpeeds.includes(speed) ? speed : availableSpeeds[availableSpeeds.length - 1]}
              onChange={(e) => handleSetSpeed(Number(e.target.value))}
              className="bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
            >
              {availableSpeeds.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
            {isFreeTier && (
              <a href="/upgrade" className="text-[10px] text-violet-400 hover:text-violet-300 leading-none">
                Upgrade for more speeds
              </a>
            )}
          </div>
          <select
            value={sleepMinutes}
            onChange={(e) => startSleepTimer(Number(e.target.value))}
            className="bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
          >
            <option value={0}>Sleep off</option>
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
      </div>
    </div>
      )}
    </>
  )
}
