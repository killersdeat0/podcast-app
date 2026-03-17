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
    insert: vi.fn(() => chain),
  }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const { mockGetUser, mockFrom, mockVerifyOwnership } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockVerifyOwnership: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/playlists/verifyOwnership', () => ({
  verifyPlaylistOwnership: mockVerifyOwnership,
}))

import { POST, DELETE, PATCH } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }
const params = Promise.resolve({ id: 'pl-1' })

const episodeBody = {
  guid: 'ep-1',
  feedUrl: 'https://feed.com/rss',
  title: 'Episode 1',
  audioUrl: 'https://audio.mp3',
  artworkUrl: 'https://art.jpg',
  podcastTitle: 'My Podcast',
  duration: 1800,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
  mockVerifyOwnership.mockResolvedValue(true)
})

describe('POST /api/playlists/[id]/episodes', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(403)
  })

  it('returns 403 when free tier has >= 10 episodes', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 10, data: null, error: null }))  // playlist_episodes count
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Episode limit reached/)
  })

  it('adds episode for free tier user under limit', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 5, data: null, error: null }))   // playlist_episodes count
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // subscriptions maybeSingle
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // episodes upsert
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // playlist_episodes max position
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // playlist_episodes upsert
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('adds episode for paid tier without limit check', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null })) // user_profiles (no count check)
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // subscriptions maybeSingle
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // episodes upsert
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // playlist_episodes max position
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // playlist_episodes upsert
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'POST',
      body: JSON.stringify(episodeBody),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledTimes(5) // no count query
  })
})

describe('DELETE /api/playlists/[id]/episodes', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'DELETE',
      body: JSON.stringify({ guid: 'ep-1' }),
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'DELETE',
      body: JSON.stringify({ guid: 'ep-1' }),
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(403)
  })

  it('removes episode and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'DELETE',
      body: JSON.stringify({ guid: 'ep-1' }),
    })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('PATCH /api/playlists/[id]/episodes', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'PATCH',
      body: JSON.stringify({ orderedGuids: ['ep-2', 'ep-1'] }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'PATCH',
      body: JSON.stringify({ orderedGuids: ['ep-2', 'ep-1'] }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(403)
  })

  it('reorders episodes and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/playlists/pl-1/episodes', {
      method: 'PATCH',
      body: JSON.stringify({ orderedGuids: ['ep-2', 'ep-1'] }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
