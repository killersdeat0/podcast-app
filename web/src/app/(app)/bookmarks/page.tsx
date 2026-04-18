'use client'

import { useEffect, useState } from 'react'
import { Trash2, Play, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { usePlayer } from '@/components/player/PlayerContext'
import { useUser } from '@/lib/auth/UserContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { groupByEpisode, type BookmarkItem } from '@/lib/bookmarks/groupByEpisode'
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function BookmarksPage() {
  const s = useStrings()
  const { isGuest } = useUser()
  const { play, seek, nowPlaying, audioRef } = usePlayer()
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function fetchBookmarks() {
    const res = await fetch('/api/bookmarks')
    if (res.ok) {
      const data = await res.json()
      setBookmarks(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isGuest) fetchBookmarks()
    else setLoading(false)
  }, [isGuest])

  useEffect(() => {
    const handler = () => fetchBookmarks()
    window.addEventListener('bookmarks-changed', handler)
    return () => window.removeEventListener('bookmarks-changed', handler)
  }, [])

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setBookmarks((prev) => prev.filter((b) => b.id !== id))
      window.dispatchEvent(new Event('bookmarks-changed'))
    } else {
      toast.error(s.bookmarks.delete_error)
    }
  }

  function handleSeek(b: BookmarkItem) {
    if (!b.episode) return
    const isLoaded = nowPlaying?.guid === b.guid && nowPlaying?.feedUrl === b.feedUrl
    if (isLoaded && audioRef?.current) {
      seek(b.positionSeconds)
    } else {
      play({
        guid: b.guid,
        feedUrl: b.feedUrl,
        title: b.episode.title,
        podcastTitle: b.episode.podcastTitle,
        artworkUrl: b.episode.artworkUrl ?? '',
        audioUrl: b.episode.audioUrl,
        duration: b.episode.duration ?? 0,
      })
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="h-8 w-40 bg-surface-container-high rounded animate-pulse mb-8" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-surface-container-low rounded-xl mb-3 animate-pulse" />
        ))}
      </div>
    )
  }

  const groups = groupByEpisode(bookmarks)

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-on-surface mb-8">{s.bookmarks.heading}</h1>

      {groups.length === 0 ? (
        <EmptyState title={s.bookmarks.empty} />
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = expanded.has(group.key)
            return (
              <div key={group.key} className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden">
                {/* Episode header — click to expand */}
                <button
                  onClick={() => toggleExpanded(group.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-left"
                >
                  <PodcastArtwork
                    src={group.episode?.artworkUrl}
                    title={group.episode?.podcastTitle}
                    className="w-11 h-11 rounded-lg flex-shrink-0 object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {group.episode?.title ?? group.guid}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">{group.episode?.podcastTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-on-surface-variant">
                      {group.bookmarks.length} {group.bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-on-surface-variant transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Timestamps */}
                {isOpen && (
                  <div className="border-t border-outline-variant divide-y divide-outline-variant">
                    {group.bookmarks.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 group/row hover:bg-surface-container transition-colors">
                        <button
                          onClick={() => handleSeek(b)}
                          title={s.bookmarks.seek}
                          className="flex items-center gap-1.5 text-xs font-mono text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          {formatTime(b.positionSeconds)}
                        </button>
                        <p className="flex-1 text-xs text-on-surface-variant italic truncate">
                          {b.note ? `"${b.note}"` : ''}
                        </p>
                        <button
                          onClick={() => handleDelete(b.id)}
                          title={s.bookmarks.delete}
                          className="text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover/row:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
