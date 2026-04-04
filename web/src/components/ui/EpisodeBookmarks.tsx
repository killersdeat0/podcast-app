'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface Bookmark {
  id: string
  positionSeconds: number
  note: string | null
  createdAt: string
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

interface EpisodeBookmarksProps {
  feedUrl: string
  guid: string
  onSeek: (seconds: number) => void
}

export function EpisodeBookmarks({ feedUrl, guid, onSeek }: EpisodeBookmarksProps) {
  const strings = useStrings()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const fetchBookmarks = useCallback(() => {
    fetch(`/api/bookmarks?feedUrl=${encodeURIComponent(feedUrl)}&guid=${encodeURIComponent(guid)}`)
      .then((r) => r.json())
      .then((data: Bookmark[]) => {
        if (Array.isArray(data)) setBookmarks(data)
      })
      .catch(() => {})
  }, [feedUrl, guid])

  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  useEffect(() => {
    window.addEventListener('bookmarks-changed', fetchBookmarks)
    return () => window.removeEventListener('bookmarks-changed', fetchBookmarks)
  }, [fetchBookmarks])

  async function deleteBookmark(id: string) {
    const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(strings.bookmarks.delete_error)
      return
    }
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    window.dispatchEvent(new Event('bookmarks-changed'))
  }

  if (bookmarks.length === 0) return null

  return (
    <div className="pl-14 pr-4 pb-3 pt-2">
      <p className="text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">{strings.bookmarks.heading}</p>
      <div className="flex flex-col gap-1">
        {bookmarks.map((b) => (
          <div key={b.id} className="flex items-center gap-2 group">
            <button
              onClick={() => onSeek(b.positionSeconds)}
              title={strings.bookmarks.seek}
              className="text-xs font-mono text-primary hover:underline flex-shrink-0 min-w-[40px]"
            >
              {formatTime(b.positionSeconds)}
            </button>
            {b.note && (
              <span className="text-xs text-on-surface-variant flex-1 min-w-0 truncate">{b.note}</span>
            )}
            <button
              onClick={() => deleteBookmark(b.id)}
              title={strings.bookmarks.delete}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-dim hover:text-error flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
