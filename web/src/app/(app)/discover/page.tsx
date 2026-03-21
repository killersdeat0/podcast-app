'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { ItunesResult } from '@/lib/itunes/search'
import { PODCAST_GENRES } from '@/lib/itunes/trending'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { PodcastCard } from '@/components/podcasts/PodcastCard'

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
  const genreScrollRef = useRef<HTMLDivElement>(null)
  const [genreAtStart, setGenreAtStart] = useState(true)
  const [genreAtEnd, setGenreAtEnd] = useState(false)

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
    setShowDropdown(false)
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

  useEffect(() => {
    const el = genreScrollRef.current
    if (!el) return
    const update = () => {
      setGenreAtStart(el.scrollLeft <= 0)
      setGenreAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
    }
    update()
    // Re-check after layout settles (pills may not be rendered yet on first run)
    const t = setTimeout(update, 100)
    el.addEventListener('scroll', update)
    return () => { el.removeEventListener('scroll', update); clearTimeout(t) }
  }, [])

  const showTrending = !searched
  const displayResults = showTrending ? trendingResults : results
  const isLoading = showTrending ? trendingLoading : loading

  // Split trending results into featured (random from top 5) + rest
  const featuredIndex = useMemo(
    () => (trendingResults.length > 0 ? Math.floor(Math.random() * trendingResults.length) : 0),
    [trendingResults]
  )
  const featuredPodcast = showTrending && !isLoading && displayResults.length > 0 ? displayResults[featuredIndex] : null
  const gridPodcasts = showTrending && !isLoading && displayResults.length > 0
    ? displayResults.filter((_, i) => i !== featuredIndex)
    : displayResults

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.discover.heading}</h1>

      {/* Search bar */}
      <form onSubmit={search} className="relative mb-8" ref={dropdownRef}>
        <div className="relative flex items-center">
          {/* Left search icon */}
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none z-10"
          />
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
            className="w-full bg-surface-container text-on-surface rounded-xl pl-11 pr-14 px-5 py-3.5 text-base outline-none border border-outline-variant focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
          {/* Icon-only submit button on the right */}
          <button
            type="submit"
            disabled={loading}
            aria-label={strings.discover.search_button}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary rounded-lg p-2 transition-colors"
          >
            <Search size={18} />
          </button>
        </div>

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
      </form>

      {error && (
        <p className="text-error text-sm mb-4">{error}</p>
      )}

      {/* Genre pills — shown when browsing trending */}
      {showTrending && (
        <>
          <h2 className="text-lg font-semibold text-on-surface mb-3">{strings.discover.trending}</h2>
          {/* Scroll container with fade edges */}
          <div className="relative mb-6">
            <div
              ref={genreScrollRef}
              className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
              style={{
                maskImage: `linear-gradient(to right, ${genreAtStart ? 'black' : 'transparent'} 0px, black 32px, black calc(100% - 32px), ${genreAtEnd ? 'black' : 'transparent'} 100%)`,
              }}
            >
              {PODCAST_GENRES.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => setActiveGenre(genre.id)}
                  className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                    activeGenre === genre.id
                      ? 'bg-primary text-on-primary font-medium shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {strings.genres[genre.id] ?? genre.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Search results heading */}
      {searched && !loading && (
        <h2 className="text-lg font-semibold text-on-surface mb-3">
          {strings.discover.results_for} &ldquo;{query}&rdquo;
        </h2>
      )}

      {/* Featured card — first trending result */}
      {featuredPodcast && (
        <Link
          href={`/podcast/${featuredPodcast.collectionId}?feed=${encodeURIComponent(featuredPodcast.feedUrl)}`}
          className="flex gap-5 bg-primary-container hover:bg-primary-container/80 rounded-2xl p-5 mb-4 transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={featuredPodcast.artworkUrl600}
            alt={featuredPodcast.collectionName}
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
          />
          <div className="overflow-hidden flex flex-col justify-center">
            <p className="text-xs font-medium text-on-primary-container/70 uppercase tracking-wide mb-1">
              {strings.discover.featured}
            </p>
            <p className="text-lg font-bold text-on-primary-container leading-snug line-clamp-1">
              {featuredPodcast.collectionName}
            </p>
            <p className="text-sm text-on-primary-container/80 mt-0.5 truncate">
              {featuredPodcast.artistName}
            </p>
            {featuredPodcast.primaryGenreName && (
              <p className="text-sm text-on-primary-container/70 mt-1.5">
                {featuredPodcast.primaryGenreName}
              </p>
            )}
          </div>
        </Link>
      )}

      {/* Podcast grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonPodcastCard key={i} />)
          : gridPodcasts.map((podcast) => (
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
