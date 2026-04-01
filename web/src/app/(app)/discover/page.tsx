'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Search, Rss, CheckCircle2 } from 'lucide-react'
import type { ItunesResult } from '@/lib/itunes/search'
import { PODCAST_GENRES } from '@/lib/itunes/trending'
import { SkeletonPodcastCard } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { PodcastCard } from '@/components/podcasts/PodcastCard'
import { useUser } from '@/lib/auth/UserContext'
import { usePlayer } from '@/components/player/PlayerContext'
import { isInProgress } from '@/lib/player/constants'

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

interface FeedPreview {
  title: string
  artworkUrl: string
  feedUrl: string
}

function AddByUrl() {
  const strings = useStrings()
  const { isGuest } = useUser()

  const [expanded, setExpanded] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preview, setPreview] = useState<FeedPreview | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [subscriptions, setSubscriptions] = useState<string[] | null>(null)

  // Lazily load subscriptions when the section is expanded (authenticated users only)
  useEffect(() => {
    if (!expanded || isGuest || subscriptions !== null) return
    fetch('/api/subscriptions')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ feed_url: string }>) => {
        setSubscriptions((data ?? []).map((s) => s.feed_url))
      })
      .catch(() => setSubscriptions([]))
  }, [expanded, isGuest, subscriptions])

  function resetPreview() {
    setPreview(null)
    setFetchError(null)
    setSubscribed(false)
  }

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault()
    resetPreview()

    const trimmed = urlInput.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setFetchError(strings.discover.add_by_url_error_invalid_url)
      return
    }

    setFetching(true)
    try {
      const res = await fetch(`/api/podcasts/feed?url=${encodeURIComponent(trimmed)}&limit=1`)
      if (!res.ok) {
        setFetchError(strings.discover.add_by_url_error_fetch_failed)
        return
      }
      const data = await res.json()
      if (!data.title) {
        setFetchError(strings.discover.add_by_url_error_fetch_failed)
        return
      }
      setPreview({ title: data.title, artworkUrl: data.artworkUrl ?? '', feedUrl: trimmed })
    } catch {
      setFetchError(strings.discover.add_by_url_error_fetch_failed)
    } finally {
      setFetching(false)
    }
  }

  async function handleSubscribe() {
    if (!preview) return

    if (isGuest) {
      setFetchError(strings.discover.add_by_url_error_sign_in)
      return
    }

    if (subscriptions && subscriptions.includes(preview.feedUrl)) {
      setFetchError(strings.discover.add_by_url_error_already_subscribed)
      return
    }

    setSubscribing(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedUrl: preview.feedUrl,
          title: preview.title,
          artworkUrl: preview.artworkUrl,
        }),
      })

      if (res.status === 409 || res.status === 403) {
        const data = await res.json()
        if (data?.error?.toLowerCase().includes('already') || res.status === 409) {
          setFetchError(strings.discover.add_by_url_error_already_subscribed)
          return
        }
        setFetchError(data?.error ?? strings.discover.add_by_url_error_fetch_failed)
        return
      }

      if (!res.ok) {
        setFetchError(strings.discover.add_by_url_error_fetch_failed)
        return
      }

      setSubscribed(true)
      setSubscriptions((prev) => (prev ? [...prev, preview.feedUrl] : [preview.feedUrl]))
      window.dispatchEvent(new Event('subscriptions-changed'))

      setTimeout(() => {
        setUrlInput('')
        setPreview(null)
        setSubscribed(false)
      }, 2000)
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <div className="mt-10 border-t border-outline-variant pt-8">
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v)
          if (expanded) resetPreview()
        }}
        className="flex items-center gap-2 group w-full"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container group-hover:bg-surface-container-high transition-colors shrink-0">
          <Rss size={15} className="text-on-surface-variant" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-on-surface">{strings.discover.add_by_url_toggle}</p>
          <p className="text-xs text-on-surface-variant">{strings.discover.add_by_url_subtitle}</p>
        </div>
      </button>

      {expanded && (
        <div className="mt-4">
          <form onSubmit={handleFetch} className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                resetPreview()
              }}
              placeholder={strings.discover.add_by_url_placeholder}
              autoFocus
              className="flex-1 bg-surface-container text-on-surface rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all min-w-0 placeholder:text-on-surface-variant"
            />
            <button
              type="submit"
              disabled={fetching || !urlInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
            >
              {fetching ? strings.discover.add_by_url_fetching : strings.discover.add_by_url_fetch}
            </button>
          </form>

          {fetchError && (
            <p className="mt-2 text-sm text-error">{fetchError}</p>
          )}

          {preview && !fetchError && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-surface-container">
              {preview.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.artworkUrl}
                  alt={preview.title}
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-surface-container-high flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface line-clamp-2">{preview.title}</p>
              </div>
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={subscribing || subscribed}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-all shrink-0"
              >
                {subscribed && <CheckCircle2 size={14} />}
                {subscribed
                  ? strings.discover.add_by_url_subscribed
                  : subscribing
                    ? strings.discover.add_by_url_subscribing
                    : strings.discover.add_by_url_subscribe}
              </button>
            </div>
          )}
        </div>
      )}
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
  const genreScrollRef = useRef<HTMLDivElement>(null)
  const [genreAtStart, setGenreAtStart] = useState(true)
  const [genreAtEnd, setGenreAtEnd] = useState(false)

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
        const items = (data ?? []).filter(isInProgress).slice(0, 10)
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

  // Split trending results into featured (random) + rest
  const featuredIndex = useMemo(
    () => (trendingResults.length > 0 ? Math.floor(Math.random() * trendingResults.length) : 0),
    [trendingResults]
  )
  const featuredPodcast = showTrending && !isLoading && displayResults.length > 0 ? displayResults[featuredIndex] : null
  const gridPodcasts = showTrending && !isLoading && displayResults.length > 0
    ? displayResults.filter((_, i) => i !== featuredIndex)
    : displayResults

  const showContinueSection =
    !isGuest && (showContinueSkeleton || continueItems.length > 0)

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

      {/* Continue Listening section */}
      {showContinueSection && (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-on-surface">
              {strings.discover.continue_listening}
            </h2>
            <Link href="/history?filter=in_progress" className="text-sm text-primary hover:underline">
              See all →
            </Link>
          </div>
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

      {searched && !loading && results.length === 0 && !error && (
        <EmptyState
          title={strings.discover.no_results_title}
          description={strings.discover.no_results_description}
        />
      )}

      {/* Private feed — add by URL */}
      <AddByUrl />
    </div>
  )
}
