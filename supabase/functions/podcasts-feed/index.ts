import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { XMLParser } from 'npm:fast-xml-parser@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: { enabled: true, maxTotalExpansions: 500000 },
})

// Safely extract a string from an XML field that may be a plain string,
// a CDATA object ({ '#text': '...' }), or a number.
function xmlStr(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    return String(obj['#text'] ?? obj['__cdata'] ?? '')
  }
  return String(val)
}

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
        guid: xmlStr(item['guid'] || ''),
        title: xmlStr(item['title']),
        audioUrl: enclosure?.['@_url'] ?? '',
        duration: parseDuration(xmlStr(item['itunes:duration'])),
        pubDate: xmlStr(item['pubDate']),
        description: xmlStr(item['description'] ?? item['itunes:summary']),
        chapterUrl: chapters?.['@_url'] ?? null,
      }
    })

    const feed = {
      title: xmlStr(channel['title']),
      description: xmlStr(channel['description']),
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
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: 'Failed to parse feed', debug: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
