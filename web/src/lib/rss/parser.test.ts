import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseFeed } from './parser'

// Helper that wraps items in a minimal RSS feed XML string
function buildFeedXml(channelExtra: string, items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test Podcast</title>
    <description>A test feed</description>
    <itunes:image href="https://cdn.example.com/artwork.jpg"/>
    ${channelExtra}
    ${items}
  </channel>
</rss>`
}

function mockFetch(xml: string, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    text: () => Promise.resolve(xml),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseFeed', () => {
  describe('basic feed structure', () => {
    it('returns null when fetch fails (non-ok response)', async () => {
      mockFetch('', false)
      const result = await parseFeed('https://example.com/feed.xml')
      expect(result).toBeNull()
    })

    it('returns null when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      const result = await parseFeed('https://example.com/feed.xml')
      expect(result).toBeNull()
    })

    it('returns null when XML has no rss channel', async () => {
      mockFetch('<notRss/>')
      const result = await parseFeed('https://example.com/feed.xml')
      expect(result).toBeNull()
    })

    it('extracts feed-level title and description', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep1</guid>
        <title>Episode 1</title>
        <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="1234"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>First episode</description>
        <itunes:duration>30:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed).not.toBeNull()
      expect(feed!.title).toBe('Test Podcast')
      expect(feed!.description).toBe('A test feed')
    })

    it('extracts artwork from itunes:image href', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep1</guid>
        <title>Episode 1</title>
        <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="1234"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>First episode</description>
        <itunes:duration>30:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.artworkUrl).toBe('https://cdn.example.com/artwork.jpg')
    })
  })

  describe('guid parsing', () => {
    it('parses guid when it is a plain string', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>plain-guid-12345</guid>
        <title>Episode</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>10:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].guid).toBe('plain-guid-12345')
    })

    it('parses guid when it is an XML object with #text (isPermaLink=false quirk)', async () => {
      // fast-xml-parser emits an object when the element has attributes:
      // <guid isPermaLink="false">https://example.com/ep1</guid>
      // becomes { '#text': 'https://example.com/ep1', '@_isPermaLink': 'false' }
      const xml = buildFeedXml('', `<item>
        <guid isPermaLink="false">https://example.com/ep1</guid>
        <title>Episode</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>5:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      // The parser extracts the #text value, not the raw object
      expect(feed!.episodes[0].guid).toBe('https://example.com/ep1')
    })
  })

  describe('field extraction', () => {
    it('extracts title, description, audioUrl, pubDate from a standard item', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-abc</guid>
        <title>My Great Episode</title>
        <enclosure url="https://cdn.example.com/ep-abc.mp3" type="audio/mpeg" length="54321"/>
        <pubDate>Tue, 15 Feb 2022 12:00:00 GMT</pubDate>
        <description>Episode description here</description>
        <itunes:duration>1:23:45</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      const ep = feed!.episodes[0]
      expect(ep.title).toBe('My Great Episode')
      expect(ep.audioUrl).toBe('https://cdn.example.com/ep-abc.mp3')
      expect(ep.pubDate).toBe('Tue, 15 Feb 2022 12:00:00 GMT')
      expect(ep.description).toBe('Episode description here')
    })

    it('parses H:MM:SS duration correctly', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-dur1</guid>
        <title>Duration Test</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>1:23:45</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      // 1*3600 + 23*60 + 45 = 5025
      expect(feed!.episodes[0].duration).toBe(5025)
    })

    it('parses MM:SS duration correctly', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-dur2</guid>
        <title>Duration Test</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>30:15</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      // 30*60 + 15 = 1815
      expect(feed!.episodes[0].duration).toBe(1815)
    })

    it('parses plain-number duration correctly', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-dur3</guid>
        <title>Duration Test</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>3600</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].duration).toBe(3600)
    })

    it('falls back to itunes:summary when description is absent', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-sum</guid>
        <title>Summary Fallback</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <itunes:summary>Fallback summary text</itunes:summary>
        <itunes:duration>5:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].description).toBe('Fallback summary text')
    })

    it('extracts podcast:chapters URL', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-ch</guid>
        <title>Chapters Episode</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>45:00</itunes:duration>
        <podcast:chapters url="https://cdn.example.com/chapters.json" type="application/json+chapters"/>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].chapterUrl).toBe('https://cdn.example.com/chapters.json')
    })
  })

  describe('missing optional fields', () => {
    it('returns null for duration when itunes:duration is absent', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-nodur</guid>
        <title>No Duration</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].duration).toBeNull()
    })

    it('returns null for chapterUrl when podcast:chapters is absent', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-noch</guid>
        <title>No Chapters</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>20:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].chapterUrl).toBeNull()
    })

    it('returns empty string for audioUrl when enclosure is absent', async () => {
      const xml = buildFeedXml('', `<item>
        <guid>ep-noenc</guid>
        <title>No Enclosure</title>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>10:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes[0].audioUrl).toBe('')
    })

    it('handles a single item (not an array) without crashing', async () => {
      // When there is only one <item>, fast-xml-parser returns an object, not an array.
      // The parser wraps it in an array via [channel.item].filter(Boolean).
      const xml = buildFeedXml('', `<item>
        <guid>single-ep</guid>
        <title>Only Episode</title>
        <enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg" length="1000"/>
        <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
        <description>desc</description>
        <itunes:duration>10:00</itunes:duration>
      </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes).toHaveLength(1)
      expect(feed!.episodes[0].guid).toBe('single-ep')
    })

    it('handles multiple items', async () => {
      const xml = buildFeedXml('', `
        <item>
          <guid>ep-1</guid>
          <title>Episode 1</title>
          <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="1000"/>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <description>desc 1</description>
          <itunes:duration>10:00</itunes:duration>
        </item>
        <item>
          <guid>ep-2</guid>
          <title>Episode 2</title>
          <enclosure url="https://cdn.example.com/ep2.mp3" type="audio/mpeg" length="2000"/>
          <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
          <description>desc 2</description>
          <itunes:duration>20:00</itunes:duration>
        </item>`)
      mockFetch(xml)
      const feed = await parseFeed('https://example.com/feed.xml')
      expect(feed!.episodes).toHaveLength(2)
      expect(feed!.episodes[0].guid).toBe('ep-1')
      expect(feed!.episodes[1].guid).toBe('ep-2')
    })
  })
})
