'use client'

import { createContext, useContext, useRef, useState, useCallback } from 'react'

export interface NowPlaying {
  guid: string
  feedUrl: string
  title: string
  podcastTitle: string
  artworkUrl: string
  audioUrl: string
  duration: number
}

interface PlayerState {
  nowPlaying: NowPlaying | null
  playing: boolean
  currentTime: number
  duration: number
  speed: number
}

interface PlayerControls {
  play: (episode: NowPlaying) => void
  togglePlay: () => void
  seek: (seconds: number) => void
  setSpeed: (speed: number) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
}

const PlayerContext = createContext<(PlayerState & PlayerControls) | null>(null)

function loadNowPlaying(): NowPlaying | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('nowPlaying')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(loadNowPlaying)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeedState] = useState(1)

  const play = useCallback((episode: NowPlaying) => {
    setNowPlaying(episode)
    setPlaying(true)
    localStorage.setItem('nowPlaying', JSON.stringify(episode))
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }, [playing])

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds
  }, [])

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s)
    if (audioRef.current) audioRef.current.playbackRate = s
  }, [])

  return (
    <PlayerContext.Provider
      value={{ nowPlaying, playing, currentTime, duration, speed, play, togglePlay, seek, setSpeed, audioRef }}
    >
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
