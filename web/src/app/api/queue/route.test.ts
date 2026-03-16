import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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
    upsert: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete']) {
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

import { GET, POST, DELETE, PATCH } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/queue', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty array when queue is empty', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns queue items with episode data', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const queueRow = { episode_guid: 'ep1', feed_url: 'https://f.com/feed', position: 0 }
    const episode = {
      guid: 'ep1', feed_url: 'https://f.com/feed', title: 'Ep 1',
      audio_url: 'https://a.mp3', duration: 1800, artwork_url: 'https://art.jpg', podcast_title: 'Podcast',
    }
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: [queueRow], error: null }))                          // queue select
      .mockImplementationOnce(() => makeChain({ data: [episode], error: null }))                           // episodes
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))                                  // subscriptions
      .mockImplementationOnce(() => makeChain({ data: [{ episode_guid: 'ep1', position_seconds: 120 }], error: null })) // playback_progress
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].episode_guid).toBe('ep1')
    expect(body[0].episode.title).toBe('Ep 1')
    expect(body[0].episode.duration).toBe(1800)
    expect(body[0].position_seconds).toBe(120)
  })
})

describe('POST /api/queue', () => {
  const episodeBody = {
    guid: 'ep1', feedUrl: 'https://f.com/feed', title: 'Ep 1',
    audioUrl: 'https://a.mp3', artworkUrl: 'https://art.jpg', podcastTitle: 'Podcast',
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when free tier queue is at the 10-episode cap', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 10, data: null, error: null }))  // queue count
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Queue limit reached/)
  })

  it('adds episode to queue for free tier user under the cap', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 5, data: null, error: null }))   // queue count
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // subscriptions
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // episodes upsert
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // queue max position
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // queue upsert
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('adds episode to queue for paid tier user without checking the cap', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null })) // user_profiles (no cap check)
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // subscriptions
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // episodes upsert
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // queue max position
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // queue upsert
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    // Verify the count query was NOT called (only 5 from() calls, not 6)
    expect(mockFrom).toHaveBeenCalledTimes(5)
  })
})

describe('DELETE /api/queue', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'DELETE',
      body: JSON.stringify({ guid: 'ep1' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it('removes the episode and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'DELETE',
      body: JSON.stringify({ guid: 'ep1' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('PATCH /api/queue', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'PATCH',
      body: JSON.stringify({ orderedGuids: ['ep1', 'ep2'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('reorders the queue and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/queue', {
      method: 'PATCH',
      body: JSON.stringify({ orderedGuids: ['ep2', 'ep1'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
