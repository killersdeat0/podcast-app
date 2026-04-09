import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock (must be hoisted and declared before imports) ──────────────

type QueryResult = { data?: unknown; error?: unknown }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  }
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { GET } from './route'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-1' } } }

type SubscriptionRow = {
  feed_url: string
  title: string
  collection_id: string | null
  last_visited_at: string | null
  subscribed_at: string | null
}

function makeSub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    feed_url: 'https://example.com/feed.xml',
    title: 'Test Podcast',
    collection_id: '12345',
    last_visited_at: '2024-01-01T00:00:00Z',
    subscribed_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeItunesResult(overrides: Record<string, unknown> = {}) {
  return {
    collectionId: 1,
    collectionName: 'Rec Podcast',
    artistName: 'Rec Artist',
    artworkUrl600: 'https://example.com/art.jpg',
    feedUrl: 'https://example.com/rec.xml',
    trackCount: 20,
    primaryGenreName: 'Technology',
    ...overrides,
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Default: authenticated, no subscriptions, no listening stats, fetch returns empty
  mockGetUser.mockResolvedValue(AUTH)
  mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: [] }),
  }))
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/podcasts/recommendations', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('returns empty results when user has no subscriptions', async () => {
    // Both subscriptions and listening_by_show return []
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).results).toEqual([])
  })

  it('returns 500 when subscriptions query errors', async () => {
    // First from call (subscriptions) returns an error
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: 'DB error' } }))
    // Second from call (listening_by_show) is fine
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('excludes subscribed feed URLs from results', async () => {
    const subscribedFeed = 'https://example.com/subscribed.xml'
    const sub = makeSub({ feed_url: subscribedFeed, collection_id: '42' })

    mockFrom.mockReturnValueOnce(makeChain({ data: [sub], error: null }))
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('lookup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ genreIds: ['1318'], collectionId: 42 }] }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [
            makeItunesResult({ collectionId: 1, feedUrl: subscribedFeed }),
            makeItunesResult({ collectionId: 2, feedUrl: 'https://example.com/other.xml' }),
          ],
        }),
      })
    }))

    const res = await GET()
    const body = await res.json()
    const ids = body.results.map((r: { collectionId: number }) => r.collectionId)
    expect(ids).not.toContain(1) // subscribed — excluded
    expect(ids).toContain(2)
  })

  it('filters out results with trackCount < 5, keeps missing/zero trackCount', async () => {
    const sub = makeSub({ collection_id: '42' })
    mockFrom.mockReturnValueOnce(makeChain({ data: [sub], error: null }))
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('lookup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ genreIds: ['1318'], collectionId: 42 }] }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [
            makeItunesResult({ collectionId: 10, feedUrl: 'https://example.com/a.xml', trackCount: 2 }),
            makeItunesResult({ collectionId: 20, feedUrl: 'https://example.com/b.xml', trackCount: 10 }),
            makeItunesResult({ collectionId: 30, feedUrl: 'https://example.com/c.xml', trackCount: 0 }),
            makeItunesResult({ collectionId: 40, feedUrl: 'https://example.com/d.xml', trackCount: undefined }),
          ],
        }),
      })
    }))

    const res = await GET()
    const body = await res.json()
    const ids = body.results.map((r: { collectionId: number }) => r.collectionId)
    expect(ids).not.toContain(10) // trackCount 2 — filtered
    expect(ids).toContain(20)     // trackCount 10 — kept
    expect(ids).toContain(30)     // trackCount 0 — kept (falsy = benefit of doubt)
    expect(ids).toContain(40)     // no trackCount — kept
  })

  it('returns at most 36 results', async () => {
    const sub = makeSub({ collection_id: '42' })
    mockFrom.mockReturnValueOnce(makeChain({ data: [sub], error: null }))
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))

    const many = Array.from({ length: 100 }, (_, i) =>
      makeItunesResult({ collectionId: i + 100, feedUrl: `https://example.com/f${i}.xml`, trackCount: 20 })
    )

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('lookup')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ genreIds: ['1318'], collectionId: 42 }] }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: many }),
      })
    }))

    const res = await GET()
    const body = await res.json()
    expect(body.results.length).toBeLessThanOrEqual(36)
  })
})
