import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type QueryResult = { data?: unknown; error?: unknown; count?: number | null }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
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

import { PATCH, POST } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

const subBody = { feedUrl: 'https://f.com/feed', title: 'My Podcast', artworkUrl: 'https://art.jpg' }

describe('POST /api/subscriptions', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when at the 500-subscription cap', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 500, data: null, error: null })) // subscriptions count
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Subscription limit reached/)
  })

  it('subscribes when under the cap', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 10, data: null, error: null }))  // subscriptions count
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // upsert
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('same 500-cap applies for paid tier', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 500, data: null, error: null })) // subscriptions count
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/subscriptions', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ feedUrl: 'https://f.com/feed', newEpisodeCount: 3 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('updates subscription fields and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ feedUrl: 'https://f.com/feed', newEpisodeCount: 2, lastVisitedAt: '2024-06-01T00:00:00Z' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('upserts new episodes to episodes table when newEpisodesToCache provided', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const subscriptionsChain = makeChain({ data: null, error: null })
    const episodesChain = makeChain({ data: null, error: null })
    mockFrom
      .mockImplementationOnce(() => subscriptionsChain) // subscriptions.update
      .mockImplementationOnce(() => episodesChain)      // episodes.upsert

    const newEpisodesToCache = [
      {
        guid: 'ep1', title: 'Episode 1', audioUrl: 'https://a.mp3',
        pubDate: '2024-06-01T00:00:00Z', duration: 1800,
        artworkUrl: 'https://art.jpg', podcastTitle: 'My Podcast',
      },
    ]
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ feedUrl: 'https://f.com/feed', newEpisodeCount: 1, newEpisodesToCache }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    // episodes table should have been queried for the upsert
    expect(mockFrom).toHaveBeenCalledWith('episodes')
    expect(episodesChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          feed_url: 'https://f.com/feed',
          guid: 'ep1',
          title: 'Episode 1',
          audio_url: 'https://a.mp3',
          podcast_title: 'My Podcast',
        }),
      ]),
      { onConflict: 'feed_url,guid' },
    )
  })

  it('skips episode upsert when newEpisodesToCache is empty', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ feedUrl: 'https://f.com/feed', newEpisodeCount: 0, newEpisodesToCache: [] }),
    })
    await PATCH(req)
    // Only one from() call (subscriptions update), NOT episodes
    expect(mockFrom).not.toHaveBeenCalledWith('episodes')
  })

  it('reorders subscriptions when orderedFeedUrls provided', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ orderedFeedUrls: ['https://a.com/feed', 'https://b.com/feed'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 400 for invalid body', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const req = new NextRequest('http://localhost/api/subscriptions', {
      method: 'PATCH',
      body: JSON.stringify({ foo: 'bar' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
