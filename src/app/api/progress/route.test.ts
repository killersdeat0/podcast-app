import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A chainable Supabase query builder mock. Every method returns the same chain
// object; the chain is also a thenable so `await chain` resolves to `result`.
type QueryResult = { data?: unknown; error?: unknown }

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
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'delete']) {
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/progress', () => {
  it('returns positionSeconds: 0 when params are missing', async () => {
    const req = new NextRequest('http://localhost/api/progress?guid=ep1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })

  it('returns positionSeconds: 0 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/progress?guid=ep1&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })

  it('returns saved positionSeconds when authenticated', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: { position_seconds: 120 }, error: null }))
    const req = new NextRequest('http://localhost/api/progress?guid=ep1&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 120 })
  })

  it('returns positionSeconds: 0 when episode has no saved progress', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/progress?guid=unknown&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })
})

describe('POST /api/progress', () => {
  const body = { guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60 }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('saves progress and returns ok when authenticated', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 500 when the database write fails', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
