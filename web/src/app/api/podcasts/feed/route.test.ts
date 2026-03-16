import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
})

afterEach(() => vi.unstubAllGlobals())

describe('GET /api/podcasts/feed', () => {
  it('returns 400 when url param is missing', async () => {
    const req = new NextRequest('http://localhost/api/podcasts/feed')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing url' })
  })

  it('returns 502 when the RSS feed fails to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const req = new NextRequest('http://localhost/api/podcasts/feed?url=https://example.com/feed.xml')
    const res = await GET(req)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Failed to parse feed' })
  })

  it('returns parsed feed data when url is valid', async () => {
    const mockFeed = {
      title: 'Test Podcast',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      episodes: [{ guid: 'ep-1', title: 'Episode 1', duration: 1800 }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockFeed) }))
    const req = new NextRequest('http://localhost/api/podcasts/feed?url=https://example.com/feed.xml')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Test Podcast')
    expect(body.artworkUrl).toBe('https://cdn.example.com/art.jpg')
    expect(body.episodes).toHaveLength(1)
    expect(body.episodes[0].guid).toBe('ep-1')
    expect(body.episodes[0].duration).toBe(1800) // 30:00 = 1800s
  })
})
