import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

afterEach(() => vi.unstubAllGlobals())

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    collectionId: 1,
    collectionName: 'Test Podcast',
    artistName: 'Test Artist',
    artworkUrl600: 'https://example.com/art.jpg',
    feedUrl: 'https://example.com/feed.xml',
    trackCount: 10,
    primaryGenreName: 'Technology',
    ...overrides,
  }
}

/** Stub fetch to return different responses based on URL pattern. */
function mockFetchByUrl(handlers: Array<{ match: string | RegExp; results: unknown[]; ok?: boolean }>) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    for (const h of handlers) {
      const matched = typeof h.match === 'string' ? url.includes(h.match) : h.match.test(url)
      if (matched) {
        return Promise.resolve({
          ok: h.ok ?? true,
          json: () => Promise.resolve({ results: h.results }),
        })
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) })
  }))
}

describe('GET /api/podcasts/similar', () => {
  it('returns empty results when term is missing', async () => {
    const req = new NextRequest('http://localhost/api/podcasts/similar')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
  })

  it('returns empty results when all iTunes searches fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=my+podcast')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
  })

  it('returns up to 6 results', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeResult({ collectionId: i + 1, feedUrl: `https://example.com/feed${i + 1}.xml` })
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: many }),
    }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=test')
    const res = await GET(req)
    const body = await res.json()
    expect(body.results).toHaveLength(6)
  })

  it('excludes result matching excludeId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [
        makeResult({ collectionId: 42, feedUrl: 'https://example.com/current.xml' }),
        makeResult({ collectionId: 99, feedUrl: 'https://example.com/other.xml' }),
      ]}),
    }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=test&excludeId=42')
    const res = await GET(req)
    const body = await res.json()
    expect(body.results.map((r: ItunesResult) => r.collectionId)).not.toContain(42)
    expect(body.results.map((r: ItunesResult) => r.collectionId)).toContain(99)
  })

  it('excludes result matching excludeFeedUrl when no excludeId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [
        makeResult({ collectionId: 42, feedUrl: 'https://example.com/current.xml' }),
        makeResult({ collectionId: 99, feedUrl: 'https://example.com/other.xml' }),
      ]}),
    }))
    const req = new NextRequest(
      'http://localhost/api/podcasts/similar?term=test&excludeFeedUrl=https%3A%2F%2Fexample.com%2Fcurrent.xml'
    )
    const res = await GET(req)
    const body = await res.json()
    expect(body.results.map((r: ItunesResult) => r.collectionId)).not.toContain(42)
  })

  it('excludes subscribed feed URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [
        makeResult({ collectionId: 1, feedUrl: 'https://example.com/subscribed.xml' }),
        makeResult({ collectionId: 2, feedUrl: 'https://example.com/other.xml' }),
      ]}),
    }))
    const req = new NextRequest(
      'http://localhost/api/podcasts/similar?term=test&subscribedFeedUrls=https%3A%2F%2Fexample.com%2Fsubscribed.xml'
    )
    const res = await GET(req)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].collectionId).toBe(2)
  })

  it('filters out results missing feedUrl', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [
        makeResult({ collectionId: 1, feedUrl: undefined }),
        makeResult({ collectionId: 2, feedUrl: 'https://example.com/feed.xml' }),
      ]}),
    }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=test')
    const res = await GET(req)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].collectionId).toBe(2)
  })

  it('strips generic words from term before searching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=The+Crime+Junkie+Podcast')
    await GET(req)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    // At least one call should be a search with the cleaned term
    const searchCall = calls.find((c: string[]) => c[0].includes('itunes.apple.com/search') && c[0].includes('term='))
    expect(searchCall).toBeDefined()
    const url = new URL(searchCall[0])
    const termValue = url.searchParams.get('term') ?? ''
    expect(termValue).toContain('crime')
    expect(termValue).toContain('junkie')
    expect(termValue).not.toContain('podcast')
  })

  it('falls back to full term when all words are generic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }))
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=The+Podcast')
    await GET(req)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const searchCall = calls.find((c: string[]) => c[0].includes('itunes.apple.com/search') && c[0].includes('term='))
    const url = new URL(searchCall[0])
    // Falls back to original term — should not be empty
    expect(url.searchParams.get('term')).toBeTruthy()
  })

  it('deduplicates results across passes — first occurrence (name+genre) wins', async () => {
    const sharedPodcast = makeResult({ collectionId: 10, feedUrl: 'https://example.com/shared.xml' })
    const genreOnly = makeResult({ collectionId: 20, feedUrl: 'https://example.com/genre.xml' })

    mockFetchByUrl([
      // iTunes lookup for genre — returns genreIds array
      { match: 'lookup', results: [{ genreIds: ['1318', '26'], collectionId: 99 }] },
      // Name+genre search — returns shared podcast
      { match: /search.*genreId.*term=(?!podcast)/, results: [sharedPodcast] },
      // Name+genre for secondary genre — also returns shared podcast (should be deduped)
      { match: /search.*term=(?!podcast)/, results: [sharedPodcast, genreOnly] },
      // Genre-only search
      { match: /search.*term=podcast/, results: [] },
    ])

    const req = new NextRequest('http://localhost/api/podcasts/similar?term=tech&excludeId=99')
    const res = await GET(req)
    const body = await res.json()
    const ids = body.results.map((r: ItunesResult) => r.collectionId)
    // sharedPodcast should appear only once
    expect(ids.filter((id: number) => id === 10)).toHaveLength(1)
  })

  it('does not run genre searches when no collectionId is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }))
    // No excludeId → no genre lookup
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=test')
    await GET(req)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const lookupCall = calls.find((c: string[]) => c[0].includes('lookup'))
    expect(lookupCall).toBeUndefined()
  })

  it('uses all specific genreIds (≥1300) for genre-only searches, skipping generic ones', async () => {
    mockFetchByUrl([
      // iTunes lookup returns two specific genres + one generic (26 = Podcasts)
      { match: 'lookup', results: [{ genreIds: ['1318', '1489', '26'], collectionId: 99 }] },
      { match: /search/, results: [] },
    ])
    const req = new NextRequest('http://localhost/api/podcasts/similar?term=test&excludeId=99')
    await GET(req)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const genreOnlyCalls = calls.filter((c: string[]) =>
      c[0].includes('term=podcast') && c[0].includes('genreId')
    )
    // Should search genre 1318 and 1489, but NOT 26
    const calledGenreIds = genreOnlyCalls.map((c: string[]) => new URL(c[0]).searchParams.get('genreId'))
    expect(calledGenreIds).toContain('1318')
    expect(calledGenreIds).toContain('1489')
    expect(calledGenreIds).not.toContain('26')
  })
})

// Local type alias to satisfy TypeScript in test assertions
type ItunesResult = { collectionId: number; feedUrl: string }
