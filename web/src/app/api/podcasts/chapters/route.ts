import { NextRequest, NextResponse } from 'next/server'

export interface Chapter {
  startTime: number
  title?: string
  img?: string
  url?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return NextResponse.json({ chapters: [] })

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return NextResponse.json({ chapters: [] })
    const data = await res.json()
    return NextResponse.json({ chapters: (data.chapters ?? []) as Chapter[] })
  } catch {
    return NextResponse.json({ chapters: [] })
  }
}
