'use client'

import { useEffect, useState } from 'react'
import { usePlayer } from '@/components/player/PlayerContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { COMPLETION_THRESHOLD_PCT } from '@/lib/player/constants'

interface HistoryItem {
  episode_guid: string
  feed_url: string
  position_seconds: number
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
  const { play } = usePlayer()
  const strings = useStrings()

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setItems(data)
      })
      .finally(() => setLoading(false))
  }, [])

  function playItem(item: HistoryItem) {
    if (!item.episode) return
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

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.history.heading}</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />
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
            const pct = progressPct(item.position_seconds, item.episode?.duration ?? null, item.completed)
            return (
            <button
              key={item.episode_guid}
              onClick={() => playItem(item)}
              disabled={!item.episode}
              className="relative w-full flex items-center gap-3 text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-4 py-3 transition-colors disabled:opacity-50 overflow-hidden"
            >
              {pct !== null && (
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{
                    background: pct >= 100
                      ? 'rgba(34,197,94,0.12)'
                      : `linear-gradient(to right, rgba(34,197,94,0.12) ${pct}%, rgba(139,92,246,0.10) ${pct}%)`,
                  }}
                />
              )}
              {item.episode?.artwork_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.episode.artwork_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-700 flex-shrink-0" />
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">
                  {item.episode?.title ?? item.episode_guid}
                </p>
                <div className="flex gap-2 mt-0.5">
                  {item.episode?.podcast_title && (
                    <span className="text-xs text-gray-400 truncate">{item.episode.podcast_title}</span>
                  )}
                  {item.episode?.duration && (
                    <span className="text-xs text-gray-500">{formatDuration(item.episode.duration)}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                {(item.completed || (pct !== null && pct >= COMPLETION_THRESHOLD_PCT)) ? (
                  <span className="text-xs text-green-400">Done</span>
                ) : (
                  <span className="text-xs text-gray-500">
                    {formatProgress(item.position_seconds, item.episode?.duration ?? null)}
                  </span>
                )}
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(item.updated_at).toLocaleDateString()}
                </p>
              </div>
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
