'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { ItunesResult } from '@/lib/itunes/search'
import { PODCAST_GENRES } from '@/lib/itunes/trending'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { PodcastCard } from '@/components/podcasts/PodcastCard'
import { useUser } from '@/lib/auth/UserContext'
import { usePlayer } from '@/components/player/PlayerContext'

interface HistoryItem {
  episode_guid: string
  feed_url: string
  position_seconds: number
  position_pct: number | null
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

function ContinueCard({ item }: { item: HistoryItem }) {
  const { play } = usePlayer()
  const ep = item.episode

  function handleClick() {
    if (!ep) return
    play({
      guid: item.episode_guid,
      feedUrl: item.feed_url,
      title: ep.title,
      podcastTitle: ep.podcast_title ?? '',
      artworkUrl: ep.artwork_url ?? '',
      audioUrl: ep.audio_url,
      duration: ep.duration ?? 0,
    })
  }

  return (
    <button
      onClick={handleClick}
      className="w-36 flex-shrink-0 text-left hover:opacity-80 transition-opacity"
    >
      {ep?.artwork_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ep.artwork_url}
          alt={ep.title}
          className="w-36 h-36 rounded-xl object-cover"
        />
      ) : (
        <div className="w-36 h-36 rounded-xl bg-surface-container-high" />
      )}
      <p className="text-xs font-medium text-on-surface line-clamp-2 mt-2">
        {ep?.title ?? ''}
      </p>
      <p className="text-xs text-on-surface-variant truncate mt-0.5">
        {ep?.podcast_title ?? ''}
      </p>
      <div className="h-1 rounded-full bg-surface-container-high mt-2">
        <div
          className="h-1 rounded-full bg-playback-indicator"
          style={{ width: `${item.position_pct ?? 0}%` }}
        />
      </div>
    </button>
  )
}

function ContinueListeningSkeleton() {
  return (
    <div className="w-36 flex-shrink-0 space-y-2">
      <div className="w-36 h-36 rounded-xl bg-surface-container animate-pulse" />
      <div className="h-3 rounded bg-surface-container animate-pulse w-full" />
      <div className="h-3 rounded bg-surface-container animate-pulse w-3/4" />
    </div>
  )
}

export default function DiscoverPage() {
  const strings = useStrings()
  const { isGuest } = useUser()
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

  // Continue Listening state
  const [continueItems, setContinueItems] = useState<HistoryItem[]>([])
  const [showContinueSkeleton, setShowContinueSkeleton] = useState(false)

  // Fetch continue listening on mount (authenticated users only)
  useEffect(() => {
    if (isGuest) return

    let cancelled = false

    // 300ms delay before showing skeletons to avoid flash on fast connections
    const skeletonTimer = setTimeout(() => {
      if (!cancelled) setShowContinueSkeleton(true)
    }, 300)

    fetch('/api/history')
      .then((res) => res.json())
      .then((data: HistoryItem[]) => {
        if (cancelled) return
        const items = (data ?? [])
          .filter(
            (item) =>
              !item.completed &&
              item.position_seconds > 30 &&
              item.position_pct !== null
          )
          .slice(0, 10)
        setContinueItems(items)
      })
      .catch(() => {
        if (!cancelled) setContinueItems([])
      })
      .finally(() => {
        if (!cancelled) setShowContinueSkeleton(false)
        clearTimeout(skeletonTimer)
      })

    return () => {
      cancelled = true
      clearTimeout(skeletonTimer)
    }
  }, [isGuest])

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
      setError(strings.discover.search_error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const showTrending = !searched
  const displayResults = showTrending ? trendingResults : results
  const isLoading = showTrending ? trendingLoading : loading

  const showContinueSection =
    !isGuest && (showContinueSkeleton || continueItems.length > 0)

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.discover.heading}</h1>

      {/* Continue Listening section */}
      {showContinueSection && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-3">
            {strings.discover.continue_listening}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {showContinueSkeleton
              ? Array.from({ length: 3 }).map((_, i) => (
                  <ContinueListeningSkeleton key={i} />
                ))
              : continueItems.map((item) => (
                  <ContinueCard key={item.episode_guid} item={item} />
                ))}
          </div>
        </section>
      )}

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
            className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Autocomplete Dropdown */}
          {showDropdown && query.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-low border border-outline-variant rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-md bg-opacity-95">
              {loadingSuggestions ? (
                <div className="p-4 text-sm text-on-surface-variant">{strings.discover.loading_suggestions}</div>
              ) : suggestions.length > 0 ? (
                <ul>
                  {suggestions.map((podcast) => (
                    <li key={podcast.collectionId}>
                      <Link
                        href={`/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors"
                        onClick={() => setShowDropdown(false)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={podcast.artworkUrl600}
                          alt={podcast.collectionName}
                          className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                        />
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm text-on-surface truncate">{podcast.collectionName}</p>
                          <p className="text-xs text-on-surface-variant truncate mt-0.5">{podcast.artistName}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-sm text-on-surface-variant">
                  {strings.discover.no_suggestions} &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg px-6 py-3 text-sm font-medium transition-colors"
        >
          {loading ? '...' : strings.discover.search_button}
        </button>
      </form>

      {error && (
        <p className="text-error text-sm mb-4">{error}</p>
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
                    ? 'bg-brand text-on-surface'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
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
