'use client'

import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'

export interface NowPlaying {
  guid: string
  feedUrl: string
  title: string
  podcastTitle: string
  artworkUrl: string
  audioUrl: string
  duration: number
  chapterUrl?: string | null
}

interface PlayerState {
  nowPlaying: NowPlaying | null
  playing: boolean
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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nowPlaying')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setNowPlaying(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

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
      value={{ nowPlaying, playing, speed, play, togglePlay, seek, setSpeed, audioRef }}
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
