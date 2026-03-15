import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(results: unknown[], ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve({ results }),
  }))
}

describe('GET /api/podcasts/search', () => {
  it('returns empty results when q param is missing', async () => {
    const req = new NextRequest('http://localhost/api/podcasts/search')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
  })

  it('returns iTunes results when q is provided', async () => {
    mockFetch([{ collectionId: 42, collectionName: 'My Podcast', feedUrl: 'https://example.com/feed' }])
    const req = new NextRequest('http://localhost/api/podcasts/search?q=my+podcast')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].collectionId).toBe(42)
  })

  it('returns empty results when iTunes API returns non-ok response', async () => {
    mockFetch([], false)
    const req = new NextRequest('http://localhost/api/podcasts/search?q=anything')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
  })
})
