'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
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
  const { id } = useParams<{ id: string }>()
  const feedUrl = params.get('feed') ?? ''
  const title = params.get('title') ?? ''
  const artwork = params.get('artwork') ?? ''
  const { play } = usePlayer()

  const [feed, setFeed] = useState<PodcastFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(new Set())

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

  // Check subscription status + current queue
  useEffect(() => {
    if (!feedUrl) return
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((subs: Array<{ feed_url: string }>) => {
        setSubscribed(subs.some((s) => s.feed_url === feedUrl))
      })
      .catch(() => {})
    fetch('/api/queue')
      .then((r) => r.json())
      .then((items: Array<{ episode_guid: string }>) => {
        setQueuedGuids(new Set(items.map((i) => i.episode_guid)))
      })
      .catch(() => {})
  }, [feedUrl])

  async function toggleSubscribe() {
    setSubscribing(true)
    try {
      if (subscribed) {
        await fetch('/api/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl }),
        })
        setSubscribed(false)
      } else {
        await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl, title, artworkUrl: artwork, collectionId: id }),
        })
        setSubscribed(true)
      }
      window.dispatchEvent(new Event('subscriptions-changed'))
    } finally {
      setSubscribing(false)
    }
  }

  async function toggleQueue(episode: Episode) {
    const inQueue = queuedGuids.has(episode.guid)
    if (inQueue) {
      await fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid: episode.guid }),
      })
      setQueuedGuids((prev) => {
        const s = new Set(prev)
        s.delete(episode.guid)
        return s
      })
    } else {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: episode.guid,
          feedUrl,
          title: episode.title,
          audioUrl: episode.audioUrl,
          artworkUrl: artwork || feed?.artworkUrl || '',
          podcastTitle: title,
          duration: episode.duration,
          pubDate: episode.pubDate,
          description: episode.description,
        }),
      })
      setQueuedGuids((prev) => new Set([...prev, episode.guid]))
    }
  }

  function playEpisode(episode: Episode) {
    play({
      guid: episode.guid,
      feedUrl,
      title: episode.title,
      podcastTitle: title,
      artworkUrl: artwork || feed?.artworkUrl || '',
      audioUrl: episode.audioUrl,
      duration: episode.duration ?? 0,
      chapterUrl: episode.chapterUrl,
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
        <div className="flex flex-col justify-end gap-3">
          <h1 className="text-2xl font-bold">{title}</h1>
          {feed && <p className="text-gray-400 text-sm line-clamp-3">{feed.description}</p>}
          <button
            onClick={toggleSubscribe}
            disabled={subscribing}
            className={`self-start px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              subscribed
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {subscribing ? '...' : subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
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
            <div key={ep.guid} className="flex items-center gap-2">
              <button
                onClick={() => playEpisode(ep)}
                className="flex-1 text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
              >
                <p className="text-sm font-medium text-white">{ep.title}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-gray-500">{new Date(ep.pubDate).toLocaleDateString()}</span>
                  {ep.duration && (
                    <span className="text-xs text-gray-500">{formatDuration(ep.duration)}</span>
                  )}
                </div>
              </button>
              <button
                onClick={() => toggleQueue(ep)}
                title={queuedGuids.has(ep.guid) ? 'Remove from queue' : 'Add to queue'}
                className={`p-3 rounded-lg text-lg transition-colors ${
                  queuedGuids.has(ep.guid)
                    ? 'text-violet-400 hover:text-red-400'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {queuedGuids.has(ep.guid) ? '✓' : '+'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
