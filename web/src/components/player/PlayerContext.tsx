'use client'

import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'

export interface PlaylistEpisodeRef {
  guid: string
  feedUrl: string
  title: string
  podcastTitle: string
  artworkUrl: string
  audioUrl: string
  duration: number
}

export interface NowPlaying {
  guid: string
  feedUrl: string
  title: string
  podcastTitle: string
  artworkUrl: string
  audioUrl: string
  duration: number
  chapterUrl?: string | null
  playlistContext?: { playlistId: string; episodes: PlaylistEpisodeRef[] } | null
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
  clientQueue: NowPlaying[]
  enqueueClient: (ep: NowPlaying) => void
  prependClient: (ep: NowPlaying) => void
  dequeueClient: (guid: string) => void
  clearClientQueue: () => void
  clearNowPlaying: () => void
  playPlaylist: (playlistId: string, episodes: PlaylistEpisodeRef[], startIndex?: number) => void
  updatePlaylistEpisodes: (episodes: PlaylistEpisodeRef[]) => void
}

const PlayerContext = createContext<(PlayerState & PlayerControls) | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [clientQueue, setClientQueue] = useState<NowPlaying[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nowPlaying')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- setState in useEffect is intentional: restores localStorage on mount, can't use initial state (SSR has no localStorage)
      if (raw) setNowPlaying(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('guestQueue')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- same as above: localStorage restore on mount
      if (raw) setClientQueue(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  const play = useCallback((episode: NowPlaying) => {
    setNowPlaying(episode)
    setPlaying(true)
    localStorage.setItem('nowPlaying', JSON.stringify(episode))
    window.dispatchEvent(new CustomEvent('history-changed', { detail: { guid: episode.guid } }))
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

  const enqueueClient = useCallback((ep: NowPlaying) => {
    setClientQueue((prev) => {
      if (prev.find((e) => e.guid === ep.guid)) return prev
      if (prev.length >= 10) return prev
      const next = [...prev, ep]
      localStorage.setItem('guestQueue', JSON.stringify(next))
      return next
    })
  }, [])

  const prependClient = useCallback((ep: NowPlaying) => {
    setClientQueue((prev) => {
      if (prev.find((e) => e.guid === ep.guid)) return prev
      const next = [ep, ...prev].slice(0, 10)
      localStorage.setItem('guestQueue', JSON.stringify(next))
      return next
    })
  }, [])

  const dequeueClient = useCallback((guid: string) => {
    setClientQueue((prev) => {
      const next = prev.filter((e) => e.guid !== guid)
      localStorage.setItem('guestQueue', JSON.stringify(next))
      return next
    })
  }, [])

  const clearClientQueue = useCallback(() => {
    setClientQueue([])
    localStorage.removeItem('guestQueue')
  }, [])

  const clearNowPlaying = useCallback(() => {
    audioRef.current?.pause()
    setNowPlaying(null)
    setPlaying(false)
    localStorage.removeItem('nowPlaying')
  }, [])

  const playPlaylist = useCallback((playlistId: string, episodes: PlaylistEpisodeRef[], startIndex = 0) => {
    const ep = episodes[startIndex]
    if (!ep) return
    play({
      ...ep,
      playlistContext: { playlistId, episodes },
    })
  }, [play])

  const updatePlaylistEpisodes = useCallback((episodes: PlaylistEpisodeRef[]) => {
    setNowPlaying((prev) => {
      if (!prev?.playlistContext) return prev
      const updated = { ...prev, playlistContext: { ...prev.playlistContext, episodes } }
      localStorage.setItem('nowPlaying', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <PlayerContext.Provider
      value={{ nowPlaying, playing, speed, play, togglePlay, seek, setSpeed, audioRef, clientQueue, enqueueClient, prependClient, dequeueClient, clearClientQueue, clearNowPlaying, playPlaylist, updatePlaylistEpisodes }}
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
