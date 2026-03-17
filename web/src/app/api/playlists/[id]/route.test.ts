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

const { mockGetUser, mockFrom, mockAdminFrom, mockVerifyOwnership } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockVerifyOwnership: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

vi.mock('@/lib/playlists/verifyOwnership', () => ({
  verifyPlaylistOwnership: mockVerifyOwnership,
}))

import { GET, PATCH, DELETE } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }
const params = Promise.resolve({ id: 'pl-1' })

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
  mockAdminFrom.mockReturnValue(makeChain())
})

describe('GET /api/playlists/[id]', () => {
  it('returns 404 for non-public playlist when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    // Anon RLS policy only exposes is_public=true rows; private playlist → no row returned
    mockFrom.mockImplementationOnce(() => makeChain({ data: null, error: { message: 'Not found' } }))
    const req = new NextRequest('http://localhost/api/playlists/pl-1')
    const res = await GET(req, { params })
    expect(res.status).toBe(404)
  })

  it('returns playlist with isOwner=false for unauthenticated public playlist', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const playlist = { id: 'pl-1', is_public: true, user_id: 'other', name: 'Public' }
    // Anon RLS policy allows reading is_public=true rows directly via createClient()
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: playlist, error: null }))  // playlists
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))         // playlist_episodes (empty → no further queries)
    const req = new NextRequest('http://localhost/api/playlists/pl-1')
    const res = await GET(req, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isOwner).toBe(false)
    expect(body.playlist.name).toBe('Public')
  })

  it('returns playlist with isOwner=true for owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const playlist = { id: 'pl-1', is_public: false, user_id: 'user-123', name: 'Mine' }
    // from('playlists').select().eq().single() → playlist
    // from('playlist_episodes').select().eq().order() → [] (empty guids/feedUrls, Promise.all short-circuits)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: playlist, error: null }))  // playlists
      .mockImplementationOnce(() => makeChain({ data: [], error: null }))         // playlist_episodes
    const req = new NextRequest('http://localhost/api/playlists/pl-1')
    const res = await GET(req, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isOwner).toBe(true)
  })
})

describe('PATCH /api/playlists/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists/pl-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/playlists/pl-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(403)
  })

  it('updates playlist and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(true)
    const updated = { id: 'pl-1', name: 'New Name', is_public: true }
    // from('playlists').update(...).eq(...).select().single()
    const updateChain = makeChain({ data: updated, error: null })
    mockFrom.mockReturnValue(updateChain)
    const req = new NextRequest('http://localhost/api/playlists/pl-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name', isPublic: true }),
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.playlist.name).toBe('New Name')
  })
})

describe('DELETE /api/playlists/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/playlists/pl-1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not owner', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/playlists/pl-1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(403)
  })

  it('deletes playlist and returns ok', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockVerifyOwnership.mockResolvedValue(true)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/playlists/pl-1', { method: 'DELETE' })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
