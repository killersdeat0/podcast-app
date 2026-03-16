import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const term = url.searchParams.get('q')
  if (!term) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const itunesUrl = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=20`
  const res = await fetch(itunesUrl)
  if (!res.ok) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const data = await res.json()
  return new Response(JSON.stringify({ results: data.results ?? [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
