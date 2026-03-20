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
    maybeSingle: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'delete', 'gt']) {
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/progress/completed', () => {
  it('returns empty progress when feedUrl is missing', async () => {
    const req = new NextRequest('http://localhost/api/progress/completed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ progress: [] })
  })

  it('returns empty progress when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/progress/completed?feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ progress: [] })
  })

  it('returns progress records with mapped field names', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({
      data: [
        { episode_guid: 'ep1', position_seconds: 1800, position_pct: 95, completed: true },
        { episode_guid: 'ep2', position_seconds: 600, position_pct: null, completed: false },
      ],
      error: null,
    }))
    const req = new NextRequest('http://localhost/api/progress/completed?feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      progress: [
        { guid: 'ep1', positionSeconds: 1800, positionPct: 95, completed: true },
        { guid: 'ep2', positionSeconds: 600, positionPct: null, completed: false },
      ],
    })
  })

  it('returns empty progress when no episodes have been listened to', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const req = new NextRequest('http://localhost/api/progress/completed?feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ progress: [] })
  })

  it('defaults completed to false when null in database', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({
      data: [{ episode_guid: 'ep1', position_seconds: 300, completed: null }],
      error: null,
    }))
    const req = new NextRequest('http://localhost/api/progress/completed?feedUrl=https://example.com/feed')
    const res = await GET(req)
    const body = await res.json()
    expect(body.progress[0].completed).toBe(false)
  })
})
