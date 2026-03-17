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
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete', 'not']) {
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

import { GET, POST, PATCH } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/playlists', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty array when no playlists', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns playlists with episode_count', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const raw = [
      { id: 'pl-1', name: 'Favs', is_public: false, position: 0, user_id: 'user-123', playlist_episodes: [{ count: 5 }] },
    ]
    mockFrom.mockReturnValue(makeChain({ data: raw, error: null }))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].episode_count).toBe(5)
    expect(body[0].playlist_episodes).toBeUndefined()
  })
})

describe('POST /api/playlists', () => {
  const body = { name: 'My Playlist', description: 'A description' }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when free tier has >= 3 playlists', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 3, data: null, error: null }))   // playlists count
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Playlist limit reached/)
  })

  it('creates playlist for free tier user under limit', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const newPlaylist = { id: 'pl-new', name: 'My Playlist', user_id: 'user-123' }
    // insert returns a chain; .select().single() on that chain returns the playlist
    const insertChain = makeChain({ data: newPlaylist, error: null })
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'free' }, error: null })) // user_profiles
      .mockImplementationOnce(() => makeChain({ count: 1, data: null, error: null }))   // playlists count
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // max position
      .mockImplementationOnce(() => insertChain)                                         // insert
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.playlist).toMatchObject({ name: 'My Playlist' })
  })

  it('creates playlist for paid tier user without checking limit', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const newPlaylist = { id: 'pl-new', name: 'My Playlist', user_id: 'user-123' }
    const insertChain = makeChain({ data: newPlaylist, error: null })
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: { tier: 'paid' }, error: null })) // user_profiles (no count check)
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))              // max position
      .mockImplementationOnce(() => insertChain)                                         // insert
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })
})

describe('PATCH /api/playlists', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds: ['pl-1', 'pl-2'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('reorders playlists and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/playlists', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds: ['pl-2', 'pl-1'] }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
