import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type QueryResult = { data?: unknown; error?: unknown }

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

import { PATCH } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
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
