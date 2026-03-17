'use client'

import { useState, useEffect } from 'react'

interface Playlist {
  id: string
  name: string
}

export function useUserPlaylists(isGuest: boolean): Playlist[] {
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  useEffect(() => {
    if (isGuest) return
    function fetchPlaylists() {
      fetch('/api/playlists')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setPlaylists(data) })
        .catch(() => {})
    }
    fetchPlaylists()
    window.addEventListener('playlists-changed', fetchPlaylists)
    return () => window.removeEventListener('playlists-changed', fetchPlaylists)
  }, [isGuest])

  return playlists
}
