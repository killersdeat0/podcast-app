import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { XMLParser } from 'npm:fast-xml-parser@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function parseDuration(raw: string): number | null {
  if (!raw) return null
  const parts = raw.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  const n = Number(raw)
  return isNaN(n) ? null : n
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const feedUrl = url.searchParams.get('url')
  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch(feedUrl)
    if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
    const xml = await res.text()
    const result = parser.parse(xml)
    const channel = result?.rss?.channel
    if (!channel) throw new Error('No channel in feed')

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean)

    const episodes = items.map((item: Record<string, unknown>) => {
      const enclosure = item['enclosure'] as Record<string, string> | undefined
      const chapters = item['podcast:chapters'] as Record<string, string> | undefined
      return {
        // guid can be an XML object { '#text': '...', '@_isPermaLink': 'false' } — do not simplify to String(item['guid'])
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

    const feed = {
      title: String(channel['title'] ?? ''),
      description: String(channel['description'] ?? ''),
      artworkUrl:
        (channel['itunes:image'] as Record<string, string> | undefined)?.['@_href'] ??
        (channel['image'] as Record<string, string> | undefined)?.['url'] ??
        '',
      episodes,
    }

    return new Response(JSON.stringify(feed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to parse feed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
