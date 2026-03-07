'use client'

import { useEffect, useRef, useState } from 'react'
import { usePlayer } from './PlayerContext'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function Player() {
  const { nowPlaying, playing, speed, togglePlay, seek, setSpeed, audioRef } = usePlayer()
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [artworkError, setArtworkError] = useState(false)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedAt = useRef(0)
  const nowPlayingRef = useRef(nowPlaying)

  useEffect(() => {
    nowPlayingRef.current = nowPlaying
    setArtworkError(false)
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
        audio.play()
      })
      .catch(() => audio.play())
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
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDuration)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDuration)
    }
  }, [audioRef])

  function startSleepTimer(minutes: number) {
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    setSleepMinutes(minutes)
    if (minutes === 0) return
    sleepTimer.current = setTimeout(() => {
      audioRef.current?.pause()
      setSleepMinutes(0)
    }, minutes * 60 * 1000)
  }

  if (!nowPlaying) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-3 z-50">
      {/* Hidden audio element */}
      <audio ref={audioRef} />

      <div className="max-w-screen-xl mx-auto flex items-center gap-6">
        {/* Artwork + info */}
        <div className="flex items-center gap-3 w-56 flex-shrink-0">
          {nowPlaying.artworkUrl && !artworkError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.artworkUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover"
              onError={() => setArtworkError(true)}
            />
          )}
          <div className="overflow-hidden">
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
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="flex-1 accent-violet-500"
            />
            <span className="text-xs text-gray-400 w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Speed + Sleep timer */}
        <div className="flex items-center gap-3 w-48 justify-end flex-shrink-0">
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-gray-800 text-white text-xs rounded px-2 py-1 outline-none"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
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
  )
}
