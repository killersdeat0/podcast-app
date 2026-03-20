import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchTopPodcasts(limit = 25): Promise<unknown[]> {
  const chartRes = await fetch(
    `https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/${limit}/podcasts.json`
  )
  if (!chartRes.ok) return []

  const chart = await chartRes.json()
  const ids: string = (chart?.feed?.results ?? []).map((r: { id: string }) => r.id).join(',')
  if (!ids) return []

  const lookupRes = await fetch(
    `https://itunes.apple.com/lookup?id=${ids}&entity=podcast`
  )
  if (!lookupRes.ok) return []

  const lookupData = await lookupRes.json()
  return (lookupData.results ?? []).filter(
    (r: Record<string, unknown>) => r.feedUrl && r.collectionName
  )
}

async function fetchPodcastsByGenre(genreId: number, limit = 25): Promise<unknown[]> {
  const res = await fetch(
    `https://itunes.apple.com/search?media=podcast&term=podcast&genreId=${genreId}&limit=${limit}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const genreId = url.searchParams.get('genreId')

  const results =
    genreId && Number(genreId) > 0
      ? await fetchPodcastsByGenre(Number(genreId))
      : await fetchTopPodcasts()

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
