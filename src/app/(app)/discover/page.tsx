'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { ItunesResult } from '@/lib/itunes/search'
import { PODCAST_GENRES } from '@/lib/itunes/trending'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'

function PodcastCard({ podcast }: { podcast: ItunesResult }) {
  return (
    <Link
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
  )
}

export default function DiscoverPage() {
  const strings = useStrings()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItunesResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<ItunesResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const dropdownRef = useRef<HTMLFormElement>(null)

  // Trending state
  const [trendingResults, setTrendingResults] = useState<ItunesResult[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [activeGenre, setActiveGenre] = useState(0)

  // Fetch trending on mount and when genre changes
  useEffect(() => {
    setTrendingLoading(true)
    const params = activeGenre > 0 ? `?genreId=${activeGenre}` : ''
    fetch(`/api/podcasts/trending${params}`)
      .then((res) => res.json())
      .then((data) => setTrendingResults(data.results ?? []))
      .catch(() => setTrendingResults([]))
      .finally(() => setTrendingLoading(false))
  }, [activeGenre])

  // Debounced autocomplete search
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    setShowDropdown(true)
    setLoadingSuggestions(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/podcasts/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setSuggestions((data.results ?? []).slice(0, 5))
        }
      } catch (err) {
        console.error('Autocomplete failed', err)
      } finally {
        setLoadingSuggestions(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const showTrending = !searched
  const displayResults = showTrending ? trendingResults : results
  const isLoading = showTrending ? trendingLoading : loading

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.discover.heading}</h1>

      <form onSubmit={search} className="relative flex gap-3 mb-8" ref={dropdownRef}>
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!e.target.value.trim()) setSearched(false)
            }}
            onFocus={() => {
              if (query.trim()) setShowDropdown(true)
            }}
            placeholder={strings.discover.search_placeholder}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />

          {/* Autocomplete Dropdown */}
          {showDropdown && query.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-md bg-opacity-95">
              {loadingSuggestions ? (
                <div className="p-4 text-sm text-gray-400">{strings.discover.loading_suggestions}</div>
              ) : suggestions.length > 0 ? (
                <ul>
                  {suggestions.map((podcast) => (
                    <li key={podcast.collectionId}>
                      <Link
                        href={`/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}&title=${encodeURIComponent(podcast.collectionName)}&artwork=${encodeURIComponent(podcast.artworkUrl600)}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors"
                        onClick={() => setShowDropdown(false)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={podcast.artworkUrl600}
                          alt={podcast.collectionName}
                          className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                        />
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm text-white truncate">{podcast.collectionName}</p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{podcast.artistName}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-sm text-gray-400">
                  {strings.discover.no_suggestions} &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors"
        >
          {loading ? '...' : strings.discover.search_button}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {/* Genre tabs — shown when browsing trending */}
      {showTrending && (
        <>
          <h2 className="text-lg font-semibold mb-4">{strings.discover.trending}</h2>
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {PODCAST_GENRES.map((genre) => (
              <button
                key={genre.id}
                onClick={() => setActiveGenre(genre.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeGenre === genre.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {strings.genres[genre.id] ?? genre.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonPodcastCard key={i} />)
          : displayResults.map((podcast) => (
              <PodcastCard key={podcast.collectionId} podcast={podcast} />
            ))}
      </div>

      {searched && !loading && results.length === 0 && !error && (
        <EmptyState
          title={strings.discover.no_results_title}
          description={strings.discover.no_results_description}
        />
      )}
    </div>
  )
}
