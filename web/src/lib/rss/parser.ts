import { XMLParser } from 'fast-xml-parser'

export interface Episode {
  guid: string
  title: string
  audioUrl: string
  duration: number | null
  pubDate: string
  description: string
  chapterUrl: string | null
}

export interface PodcastFeed {
  title: string
  description: string
  artworkUrl: string
  episodes: Episode[]
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export async function parseFeed(feedUrl: string): Promise<PodcastFeed | null> {
  try {
    const res = await fetch(feedUrl)
    if (!res.ok) return null
    const xml = await res.text()
    const result = parser.parse(xml)
    const channel = result?.rss?.channel
    if (!channel) return null

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean)

    const episodes: Episode[] = items.map((item: Record<string, unknown>) => {
      const enclosure = item['enclosure'] as Record<string, string> | undefined
      const chapters = item['podcast:chapters'] as Record<string, string> | undefined
      return {
        guid: typeof item['guid'] === 'object'
          ? String((item['guid'] as Record<string, string>)?.['#text'] ?? JSON.stringify(item['guid']))
          : String(item['guid'] ?? ''),
        title: String(item['title'] ?? ''),
        audioUrl: enclosure?.['@_url'] ?? '',
        duration: parseDuration(String(item['itunes:duration'] ?? '')),
        pubDate: String(item['pubDate'] ?? ''),
        description: String(item['description'] ?? item['itunes:summary'] ?? ''),
        chapterUrl: chapters?.['@_url'] ?? null,
      }
    })

    return {
      title: String(channel['title'] ?? ''),
      description: String(channel['description'] ?? ''),
      artworkUrl:
        (channel['itunes:image'] as Record<string, string> | undefined)?.['@_href'] ??
        (channel['image'] as Record<string, string> | undefined)?.['url'] ??
        '',
      episodes,
    }
  } catch {
    return null
  }
}

function parseDuration(raw: string): number | null {
  if (!raw) return null
  const parts = raw.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  const n = Number(raw)
  return isNaN(n) ? null : n
}
