import { NextRequest, NextResponse } from 'next/server'

export interface Chapter {
  startTime: number
  title?: string
  img?: string
  url?: string
}

function isSafeChapterUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'https:') return false
  const h = parsed.hostname.toLowerCase()
  const blocked = ['localhost', '127.', '10.', '192.168.', '172.16.', '169.254.', '::1', '[::1]']
  return !blocked.some(b => h === b || h.startsWith(b))
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url || !isSafeChapterUrl(url)) return NextResponse.json({ chapters: [] })

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return NextResponse.json({ chapters: [] })
    const data = await res.json()
    return NextResponse.json({ chapters: (data.chapters ?? []) as Chapter[] })
  } catch {
    return NextResponse.json({ chapters: [] })
  }
}
