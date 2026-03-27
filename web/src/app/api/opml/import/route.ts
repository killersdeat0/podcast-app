import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { parseFeed } from '@/lib/rss/parser'

const opmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

interface OpmlOutline {
  '@_xmlUrl'?: string
  '@_text'?: string
  '@_title'?: string
  outline?: OpmlOutline | OpmlOutline[]
}

function extractFeeds(outline: OpmlOutline | OpmlOutline[]): { feedUrl: string; title: string }[] {
  const items = Array.isArray(outline) ? outline : [outline]
  const feeds: { feedUrl: string; title: string }[] = []
  for (const item of items) {
    if (item['@_xmlUrl']) {
      try {
        const u = new URL(item['@_xmlUrl'])
        if (u.protocol === 'https:') {
          feeds.push({
            feedUrl: item['@_xmlUrl'],
            title: item['@_title'] ?? item['@_text'] ?? '',
          })
        }
      } catch {
        // skip invalid URLs
      }
    }
    if (item.outline) {
      feeds.push(...extractFeeds(item.outline))
    }
  }
  return feeds
}

async function fetchInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.all(batch.map((item, j) => fn(item, i + j))))
  }
  return results
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const text = await file.text()
  if (text.length > 500_000) {
    return NextResponse.json({ error: 'OPML file too large' }, { status: 400 })
  }
  let parsed: ReturnType<typeof opmlParser.parse>
  try {
    parsed = opmlParser.parse(text)
  } catch {
    return NextResponse.json({ error: 'Failed to parse OPML file' }, { status: 400 })
  }

  const bodyOutline = parsed?.opml?.body?.outline
  if (!bodyOutline) {
    return NextResponse.json({ error: 'No subscriptions found in OPML file' }, { status: 400 })
  }

  const feeds = extractFeeds(bodyOutline).slice(0, 200)
  if (feeds.length === 0) {
    return NextResponse.json({ error: 'No subscriptions found in OPML file' }, { status: 400 })
  }

  // Fetch existing subscriptions to determine next position
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('feed_url, position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)

  const startPosition = (existing?.[0]?.position ?? -1) + 1

  // Fetch RSS feeds in batches of 5 to avoid exhausting the connection pool
  const resolved = await fetchInBatches(feeds, 5, async ({ feedUrl, title }, i) => {
    const feed = await parseFeed(feedUrl)
    return {
      feedUrl,
      title: feed?.title || title || feedUrl,
      artworkUrl: feed?.artworkUrl ?? null,
      position: startPosition + i,
    }
  })

  // Upsert all, ignoring duplicates (conflict on user_id + feed_url)
  const rows = resolved.map(({ feedUrl, title, artworkUrl, position }) => ({
    user_id: user.id,
    feed_url: feedUrl,
    title,
    artwork_url: artworkUrl,
    position,
  }))

  const { error } = await supabase
    .from('subscriptions')
    .upsert(rows, { onConflict: 'user_id,feed_url', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: resolved.length })
}
