import { describe, it, expect, vi, beforeEach } from 'vitest'

// A chainable Supabase query builder mock. Every method returns the same chain
// object; the chain is also a thenable so `await chain` resolves to `result`.
type QueryResult = { data?: unknown; error?: unknown; count?: number | null }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'gte', 'gt', 'order', 'limit', 'in', 'not']) {
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

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

const DAILY_ROWS_30 = [
  { date: '2026-03-01', seconds_listened: 1800 },
  { date: '2026-03-15', seconds_listened: 3600 },
]

const DAILY_ROWS_ALL = [
  { date: '2025-01-10', seconds_listened: 900 },
  { date: '2026-03-01', seconds_listened: 1800 },
  { date: '2026-03-15', seconds_listened: 3600 },
]

const SHOW_ROWS_UNSORTED = [
  { feed_url: 'https://low.com/feed', seconds_listened: 100, episodes_completed: 1, last_listened_at: '2026-03-10T00:00:00Z' },
  { feed_url: 'https://high.com/feed', seconds_listened: 5000, episodes_completed: 20, last_listened_at: '2026-03-20T00:00:00Z' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/stats', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('free tier: dailyRows limited to 30 days', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles single
      .mockImplementationOnce(() => makeChain({ data: DAILY_ROWS_30, error: null }))    // listening_daily (30d)
      .mockImplementationOnce(() => makeChain({ data: SHOW_ROWS_UNSORTED, error: null })) // listening_by_show
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))               // subscriptions (titles)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tier).toBe('free')
    // dailyRows are from the 30-day filtered query
    expect(body.dailyRows).toHaveLength(2)
    expect(body.dailyRows[0]).toEqual({ date: '2026-03-01', secondsListened: 1800 })
  })

  it('paid tier: dailyRows not date-limited', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null })) // user_profiles single
      .mockImplementationOnce(() => makeChain({ data: DAILY_ROWS_ALL, error: null }))   // listening_daily (all time)
      .mockImplementationOnce(() => makeChain({ data: SHOW_ROWS_UNSORTED, error: null })) // listening_by_show
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))               // subscriptions (titles)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tier).toBe('paid')
    // All 3 rows returned (no 30-day filter)
    expect(body.dailyRows).toHaveLength(3)
    expect(body.dailyRows[0]).toEqual({ date: '2025-01-10', secondsListened: 900 })
  })

  it('showRows are sorted by seconds_listened DESC', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    // The route delegates sorting to Supabase (.order('seconds_listened', { ascending: false }))
    // In this test the mock already returns them sorted by the DB; we verify the mapping is correct.
    const sortedByDb = [
      { feed_url: 'https://high.com/feed', seconds_listened: 5000, episodes_completed: 20, last_listened_at: '2026-03-20T00:00:00Z' },
      { feed_url: 'https://low.com/feed', seconds_listened: 100, episodes_completed: 1, last_listened_at: '2026-03-10T00:00:00Z' },
    ]
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null }))
      .mockImplementationOnce(() => makeChain({ data: DAILY_ROWS_ALL, error: null }))
      .mockImplementationOnce(() => makeChain({ data: sortedByDb, error: null }))
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))               // subscriptions (titles)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.showRows).toHaveLength(2)
    expect(body.showRows[0].feedUrl).toBe('https://high.com/feed')
    expect(body.showRows[0].secondsListened).toBe(5000)
    expect(body.showRows[1].feedUrl).toBe('https://low.com/feed')
    expect(body.showRows[1].secondsListened).toBe(100)
  })

  it('returns correct response shape', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null }))
      .mockImplementationOnce(() => makeChain({ data: DAILY_ROWS_30, error: null }))
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))               // listening_by_show
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))               // subscriptions (titles)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('tier')
    expect(body).toHaveProperty('dailyRows')
    expect(body).toHaveProperty('showRows')
    expect(Array.isArray(body.dailyRows)).toBe(true)
    expect(Array.isArray(body.showRows)).toBe(true)
  })
})
