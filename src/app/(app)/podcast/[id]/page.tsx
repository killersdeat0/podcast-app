'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePlayer } from '@/components/player/PlayerContext'
import { SkeletonEpisodeRow } from '@/components/ui/Skeleton'
import type { PodcastFeed, Episode } from '@/lib/rss/parser'

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function PodcastPage() {
  const params = useSearchParams()
  const feedUrl = params.get('feed') ?? ''
  const title = params.get('title') ?? ''
  const artwork = params.get('artwork') ?? ''
  const { play } = usePlayer()

  const [feed, setFeed] = useState<PodcastFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!feedUrl) return
    setLoading(true)
    setError(false)
    fetch(`/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => setFeed(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [feedUrl])

  function playEpisode(episode: Episode) {
    play({
      guid: episode.guid,
      feedUrl,
      title: episode.title,
      podcastTitle: title,
      artworkUrl: feed?.artworkUrl ?? artwork,
      audioUrl: episode.audioUrl,
      duration: episode.duration ?? 0,
    })
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex gap-6 mb-8">
        {artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork} alt={title} className="w-32 h-32 rounded-xl object-cover flex-shrink-0" />
        )}
        <div className="flex flex-col justify-end">
          <h1 className="text-2xl font-bold">{title}</h1>
          {feed && <p className="text-gray-400 text-sm mt-2 line-clamp-3">{feed.description}</p>}
        </div>
      </div>

      {/* Episode list */}
      {error ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-3">Failed to load episodes.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-violet-400 hover:text-violet-300 text-sm"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonEpisodeRow key={i} />)}
        </div>
      ) : feed?.episodes.length === 0 ? (
        <p className="text-gray-400 text-sm">No episodes found.</p>
      ) : (
        <div className="space-y-2">
          {feed?.episodes.map((ep) => (
            <button
              key={ep.guid}
              onClick={() => playEpisode(ep)}
              className="w-full text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
            >
              <p className="text-sm font-medium text-white">{ep.title}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-gray-500">{new Date(ep.pubDate).toLocaleDateString()}</span>
                {ep.duration && (
                  <span className="text-xs text-gray-500">{formatDuration(ep.duration)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
