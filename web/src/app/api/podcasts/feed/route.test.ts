import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

const VALID_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test Podcast</title>
    <description>A test feed</description>
    <itunes:image href="https://cdn.example.com/art.jpg"/>
    <item>
      <guid>ep-1</guid>
      <title>Episode 1</title>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="1234"/>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>First episode</description>
      <itunes:duration>30:00</itunes:duration>
    </item>
  </channel>
</rss>`

afterEach(() => vi.unstubAllGlobals())

describe('GET /api/podcasts/feed', () => {
  it('returns 400 when url param is missing', async () => {
    const req = new NextRequest('http://localhost/api/podcasts/feed')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Missing url' })
  })

  it('returns 502 when the RSS feed fails to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }))
    const req = new NextRequest('http://localhost/api/podcasts/feed?url=https://example.com/feed.xml')
    const res = await GET(req)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Failed to parse feed' })
  })

  it('returns parsed feed data when url is valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(VALID_RSS) }))
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
