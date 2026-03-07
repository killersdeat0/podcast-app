'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ItunesResult } from '@/lib/itunes/search'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItunesResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const res = await fetch(`/api/podcasts/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setError('Something went wrong. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Discover</h1>

      <form onSubmit={search} className="flex gap-3 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search podcasts..."
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
        >
          {loading ? '...' : 'Search'}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonPodcastCard key={i} />)
          : results.map((podcast) => (
              <Link
                key={podcast.collectionId}
                href={`/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}&title=${encodeURIComponent(podcast.collectionName)}&artwork=${encodeURIComponent(podcast.artworkUrl600)}`}
                className="flex gap-4 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={podcast.artworkUrl600}
                  alt={podcast.collectionName}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
                <div className="overflow-hidden">
                  <p className="font-medium text-sm text-white truncate">{podcast.collectionName}</p>
                  <p className="text-xs text-gray-400 truncate mt-1">{podcast.artistName}</p>
                  <p className="text-xs text-gray-500 mt-1">{podcast.primaryGenreName}</p>
                </div>
              </Link>
            ))}
      </div>

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-gray-400 text-sm">No podcasts found for &ldquo;{query}&rdquo;.</p>
      )}
    </div>
  )
}
