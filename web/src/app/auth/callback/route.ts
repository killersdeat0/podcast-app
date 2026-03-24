import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/** Accept only safe relative paths — must start with / and not be protocol-relative or contain a scheme */
function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'email' | 'recovery' | null
  const next = sanitizeNext(searchParams.get('next'))

  const supabase = await createClient()

  // OAuth / PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${siteUrl}/login`)
    }
    return NextResponse.redirect(`${siteUrl}${next ?? '/discover'}`)
  }

  // Email link (token_hash + type)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) {
      return NextResponse.redirect(`${siteUrl}/login`)
    }
    if (type === 'recovery') {
      return NextResponse.redirect(`${siteUrl}/reset-password`)
    }
    return NextResponse.redirect(`${siteUrl}${next ?? '/discover'}`)
  }

  // Fallback: stale or unrecognised link
  return NextResponse.redirect(`${siteUrl}/login`)
}
