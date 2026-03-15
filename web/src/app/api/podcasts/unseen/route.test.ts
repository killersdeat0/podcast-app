import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type QueryResult = { data?: unknown; error?: unknown }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  }
  for (const m of ['select', 'eq', 'gt', 'order']) {
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

describe('GET /api/podcasts/unseen', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/podcasts/unseen?feedUrl=https://f.com/feed&since=2024-01-01T00:00:00.000Z')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when feedUrl is missing', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const req = new NextRequest('http://localhost/api/podcasts/unseen?since=2024-01-01T00:00:00.000Z')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when since is missing', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const req = new NextRequest('http://localhost/api/podcasts/unseen?feedUrl=https://f.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns empty array when no stored episodes match', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const req = new NextRequest('http://localhost/api/podcasts/unseen?feedUrl=https://f.com/feed&since=2024-01-01T00:00:00.000Z')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns stored episodes newer than since', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const episodes = [
      { guid: 'ep1', title: 'Episode 1', audio_url: 'https://a.mp3', pub_date: '2024-06-01T00:00:00Z', duration: 1800, artwork_url: 'https://art.jpg', chapter_url: null },
    ]
    mockFrom.mockReturnValue(makeChain({ data: episodes, error: null }))
    const req = new NextRequest('http://localhost/api/podcasts/unseen?feedUrl=https://f.com/feed&since=2024-01-01T00:00:00.000Z')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].guid).toBe('ep1')
    expect(body[0].title).toBe('Episode 1')
  })

  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    const req = new NextRequest('http://localhost/api/podcasts/unseen?feedUrl=https://f.com/feed&since=2024-01-01T00:00:00.000Z')
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})
