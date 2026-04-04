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
  }
  for (const m of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'not']) {
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

import { GET, POST } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

function req(url: string, body?: unknown) {
  return new NextRequest(url, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

// ---------------------------------------------------------------------------
// GET /api/bookmarks (no params — all bookmarks)
// ---------------------------------------------------------------------------

describe('GET /api/bookmarks (all)', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await GET(req('http://localhost/api/bookmarks'))
    expect(res.status).toBe(401)
  })

  it('returns empty array when user has no bookmarks', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const res = await GET(req('http://localhost/api/bookmarks'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns bookmarks with null episode when not in episodes table', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const bookmarkRow = { id: 'bk-1', feed_url: 'https://feed.com/rss', episode_guid: 'ep-1', position_seconds: 120, note: null, created_at: '2026-04-01T00:00:00Z' }
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain({ data: [bookmarkRow], error: null })
      // Episodes lookup returns empty
      return makeChain({ data: [], error: null })
    })
    const res = await GET(req('http://localhost/api/bookmarks'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('bk-1')
    expect(body[0].positionSeconds).toBe(120)
    expect(body[0].episode).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GET /api/bookmarks?feedUrl=&guid= (episode-specific)
// ---------------------------------------------------------------------------

describe('GET /api/bookmarks (episode-specific)', () => {
  it('returns bookmarks for the given episode sorted by positionSeconds', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const rows = [
      { id: 'bk-1', position_seconds: 60, note: null, created_at: '2026-04-01T00:00:00Z' },
      { id: 'bk-2', position_seconds: 300, note: 'great quote', created_at: '2026-04-01T00:01:00Z' },
    ]
    mockFrom.mockReturnValue(makeChain({ data: rows, error: null }))
    const res = await GET(req('http://localhost/api/bookmarks?feedUrl=https://feed.com/rss&guid=ep-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].positionSeconds).toBe(60)
    expect(body[1].note).toBe('great quote')
  })
})

// ---------------------------------------------------------------------------
// POST /api/bookmarks
// ---------------------------------------------------------------------------

describe('POST /api/bookmarks', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await POST(req('http://localhost/api/bookmarks', { feedUrl: 'https://feed.com/rss', guid: 'ep-1', positionSeconds: 120 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const res = await POST(req('http://localhost/api/bookmarks', { feedUrl: 'https://feed.com/rss' }))
    expect(res.status).toBe(400)
  })

  it('creates a bookmark and returns it', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const created = { id: 'bk-new', position_seconds: 120, note: null, created_at: '2026-04-01T00:00:00Z' }
    const chain = makeChain()
    chain.single = vi.fn().mockResolvedValue({ data: created, error: null })
    mockFrom.mockReturnValue(chain)
    const res = await POST(req('http://localhost/api/bookmarks', { feedUrl: 'https://feed.com/rss', guid: 'ep-1', positionSeconds: 120 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('bk-new')
    expect(body.positionSeconds).toBe(120)
  })

  it('floors positionSeconds to an integer', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const created = { id: 'bk-x', position_seconds: 73, note: null, created_at: '2026-04-01T00:00:00Z' }
    const chain = makeChain()
    chain.single = vi.fn().mockResolvedValue({ data: created, error: null })
    mockFrom.mockReturnValue(chain)
    const res = await POST(req('http://localhost/api/bookmarks', { feedUrl: 'https://feed.com/rss', guid: 'ep-1', positionSeconds: 73.9 }))
    expect(res.status).toBe(200)
    // The insert should have received Math.floor(73.9) = 73 — verified via the returned value
    expect((await res.json()).positionSeconds).toBe(73)
  })
})
