import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPodcasts, ItunesResult } from './search'

const MOCK_RESULT: ItunesResult = {
  collectionId: 123456,
  collectionName: 'My Test Podcast',
  artistName: 'Test Artist',
  artworkUrl600: 'https://cdn.example.com/artwork600.jpg',
  feedUrl: 'https://example.com/feed.xml',
  trackCount: 42,
  primaryGenreName: 'Technology',
}

function mockFetch(body: unknown, ok = true, throws = false) {
  if (throws) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))
    return
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchPodcasts', () => {
  it('calls the iTunes Search API with the encoded search term', async () => {
    mockFetch({ results: [] })
    await searchPodcasts('hello world')
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('hello%20world')
    expect(calledUrl).toContain('media=podcast')
  })

  it('returns correctly shaped results on success', async () => {
    mockFetch({ results: [MOCK_RESULT] })
    const results = await searchPodcasts('test')
    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.collectionId).toBe(123456)
    expect(r.collectionName).toBe('My Test Podcast')
    expect(r.artistName).toBe('Test Artist')
    expect(r.artworkUrl600).toBe('https://cdn.example.com/artwork600.jpg')
    expect(r.feedUrl).toBe('https://example.com/feed.xml')
    expect(r.trackCount).toBe(42)
    expect(r.primaryGenreName).toBe('Technology')
  })

  it('returns multiple results when the API returns multiple items', async () => {
    const second: ItunesResult = { ...MOCK_RESULT, collectionId: 999, collectionName: 'Another Podcast' }
    mockFetch({ results: [MOCK_RESULT, second] })
    const results = await searchPodcasts('podcast')
    expect(results).toHaveLength(2)
    expect(results[1].collectionName).toBe('Another Podcast')
  })

  it('handles empty results array', async () => {
    mockFetch({ results: [] })
    const results = await searchPodcasts('noresults')
    expect(results).toEqual([])
  })

  it('returns empty array when response body has no results field', async () => {
    // data.results ?? [] — missing key returns undefined, falls back to []
    mockFetch({})
    const results = await searchPodcasts('test')
    expect(results).toEqual([])
  })

  it('returns empty array when fetch response is not ok', async () => {
    mockFetch({}, false)
    const results = await searchPodcasts('test')
    expect(results).toEqual([])
  })

  it('propagates fetch errors (throws)', async () => {
    mockFetch(null, true, true)
    await expect(searchPodcasts('test')).rejects.toThrow('Network failure')
  })
})
