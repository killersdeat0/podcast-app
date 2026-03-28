import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A chainable Supabase query builder mock. Every method returns the same chain
// object; the chain is also a thenable so `await chain` resolves to `result`.
type QueryResult = { data?: unknown; error?: unknown }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'delete']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { GET, POST } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

describe('GET /api/progress', () => {
  it('returns positionSeconds: 0 when params are missing', async () => {
    const req = new NextRequest('http://localhost/api/progress?guid=ep1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })

  it('returns positionSeconds: 0 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/progress?guid=ep1&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })

  it('returns saved positionSeconds when authenticated', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: { position_seconds: 120 }, error: null }))
    const req = new NextRequest('http://localhost/api/progress?guid=ep1&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 120 })
  })

  it('returns positionSeconds: 0 when episode has no saved progress', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/progress?guid=unknown&feedUrl=https://example.com/feed')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ positionSeconds: 0 })
  })
})

describe('POST /api/progress', () => {
  const body = { guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60 }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('saves progress and returns ok when authenticated', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('caps positionSeconds to duration when positionSeconds exceeds duration and completed is false', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const chain = makeChain({ data: null, error: null })
    ;(chain as Record<string, unknown>).upsert = upsertMock
    mockFrom.mockReturnValue(chain)
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 4000, duration: 3600, completed: false }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    // Find the playback_progress upsert call (the first upsert on the chain)
    const progressUpsertArg = upsertMock.mock.calls[0][0]
    expect(progressUpsertArg.position_seconds).toBe(3600)
  })

  it('returns 500 when the database write fails', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }))
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Stats upsert tests
// ---------------------------------------------------------------------------

describe('POST /api/progress — stats upserts', () => {
  /**
   * Build a mockFrom that returns specific chains per table in order.
   * tableMap: array of [tableName, chain] pairs consumed sequentially.
   * Unknown tables fall through to a default no-op chain.
   */
  function buildFromMock(
    calls: Array<{ table: string; chain: ReturnType<typeof makeChain> }>,
  ) {
    let idx = 0
    return vi.fn((table: string) => {
      const entry = calls[idx]
      if (entry && entry.table === table) {
        idx++
        return entry.chain
      }
      // fallback no-op chain
      return makeChain({ data: null, error: null })
    })
  }

  it('upserts into listening_daily and listening_by_show using timeSinceLastSave', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    // prevProgress updated 10s ago → timeSinceLastSave = 10, secondsListened = min(10, 15) = 10
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    const prevProgressChain = makeChain({ data: { completed: false, updated_at: tenSecondsAgo }, error: null })
    const dailyRowChain = makeChain({ data: { seconds_listened: 100 }, error: null })
    const showRowChain = makeChain({ data: { seconds_listened: 200, episodes_completed: 5 }, error: null })

    const dailyUpsertChain = makeChain({ data: null, error: null })
    const dailyUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(dailyUpsertChain as Record<string, unknown>).upsert = dailyUpsertMock

    const showUpsertChain = makeChain({ data: null, error: null })
    const showUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(showUpsertChain as Record<string, unknown>).upsert = showUpsertMock

    const progressUpsertChain = makeChain({ data: null, error: null })

    const calls = [
      { table: 'playback_progress', chain: prevProgressChain },
      { table: 'playback_progress', chain: progressUpsertChain },
      { table: 'listening_daily', chain: dailyRowChain },
      { table: 'listening_daily', chain: dailyUpsertChain },
      { table: 'listening_by_show', chain: showRowChain },
      { table: 'listening_by_show', chain: showUpsertChain },
    ]
    mockFrom.mockImplementation(buildFromMock(calls))

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    // daily: 100 + 10 = 110
    expect(dailyUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ seconds_listened: 110 }),
      expect.anything(),
    )
    // show: 200 + 10 = 210, episodes_completed unchanged (5)
    expect(showUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ seconds_listened: 210, episodes_completed: 5 }),
      expect.anything(),
    )
  })

  it('caps secondsListened at 15s when timeSinceLastSave exceeds cap (e.g. after long pause)', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    // prevProgress updated 60s ago (long pause/jitter) → capped at 15
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString()
    const prevProgressChain = makeChain({ data: { completed: false, updated_at: sixtySecondsAgo }, error: null })
    const dailyRowChain = makeChain({ data: { seconds_listened: 0 }, error: null })
    const showRowChain = makeChain({ data: { seconds_listened: 0, episodes_completed: 0 }, error: null })

    const dailyUpsertChain = makeChain({ data: null, error: null })
    const dailyUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(dailyUpsertChain as Record<string, unknown>).upsert = dailyUpsertMock

    const showUpsertChain = makeChain({ data: null, error: null })
    const progressUpsertChain = makeChain({ data: null, error: null })

    const calls = [
      { table: 'playback_progress', chain: prevProgressChain },
      { table: 'playback_progress', chain: progressUpsertChain },
      { table: 'listening_daily', chain: dailyRowChain },
      { table: 'listening_daily', chain: dailyUpsertChain },
      { table: 'listening_by_show', chain: showRowChain },
      { table: 'listening_by_show', chain: showUpsertChain },
    ]
    mockFrom.mockImplementation(buildFromMock(calls))

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60 }),
    })
    await POST(req)

    // capped at 15: 0 + 15 = 15
    expect(dailyUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ seconds_listened: 15 }),
      expect.anything(),
    )
  })

  it('skips listening_daily and listening_by_show upserts when no previous row exists (first save)', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    // No prevProgress → timeSinceLastSave = 0 → skip stats
    const prevProgressChain = makeChain({ data: null, error: null })
    const progressUpsertChain = makeChain({ data: null, error: null })

    let dailyCalled = false
    let showCalled = false

    mockFrom.mockImplementation((table: string) => {
      if (table === 'playback_progress') return prevProgressChain
      if (table === 'listening_daily') { dailyCalled = true; return makeChain() }
      if (table === 'listening_by_show') { showCalled = true; return makeChain() }
      return progressUpsertChain
    })

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60 }),
    })
    await POST(req)
    expect(dailyCalled).toBe(false)
    expect(showCalled).toBe(false)
  })

  it('increments episodes_completed only on false→true completion transition', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    const prevProgressChain = makeChain({ data: { completed: false, updated_at: tenSecondsAgo }, error: null })
    const progressUpsertChain = makeChain({ data: null, error: null })
    const dailyRowChain = makeChain({ data: { seconds_listened: 0 }, error: null })
    const showRowChain = makeChain({ data: { seconds_listened: 0, episodes_completed: 2 }, error: null })
    const dailyUpsertChain = makeChain({ data: null, error: null })
    const showUpsertChain = makeChain({ data: null, error: null })
    const showUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(showUpsertChain as Record<string, unknown>).upsert = showUpsertMock

    const calls = [
      { table: 'playback_progress', chain: prevProgressChain },
      { table: 'playback_progress', chain: progressUpsertChain },
      { table: 'listening_daily', chain: dailyRowChain },
      { table: 'listening_daily', chain: dailyUpsertChain },
      { table: 'listening_by_show', chain: showRowChain },
      { table: 'listening_by_show', chain: showUpsertChain },
    ]
    mockFrom.mockImplementation(buildFromMock(calls))

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60, completed: true }),
    })
    await POST(req)

    // episodes_completed should go from 2 → 3
    expect(showUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ episodes_completed: 3 }),
      expect.anything(),
    )
  })

  it('does not increment episodes_completed when already completed (true→true)', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    const prevProgressChain = makeChain({ data: { completed: true, updated_at: tenSecondsAgo }, error: null })
    const progressUpsertChain = makeChain({ data: null, error: null })
    const dailyRowChain = makeChain({ data: { seconds_listened: 0 }, error: null })
    const showRowChain = makeChain({ data: { seconds_listened: 0, episodes_completed: 5 }, error: null })
    const dailyUpsertChain = makeChain({ data: null, error: null })
    const showUpsertChain = makeChain({ data: null, error: null })
    const showUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(showUpsertChain as Record<string, unknown>).upsert = showUpsertMock

    const calls = [
      { table: 'playback_progress', chain: prevProgressChain },
      { table: 'playback_progress', chain: progressUpsertChain },
      { table: 'listening_daily', chain: dailyRowChain },
      { table: 'listening_daily', chain: dailyUpsertChain },
      { table: 'listening_by_show', chain: showRowChain },
      { table: 'listening_by_show', chain: showUpsertChain },
    ]
    mockFrom.mockImplementation(buildFromMock(calls))

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 90, completed: true }),
    })
    await POST(req)

    // episodes_completed must stay at 5 — no double-count
    expect(showUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ episodes_completed: 5 }),
      expect.anything(),
    )
  })

  it('increments episodes_completed even when secondsListened is 0 (completion-only save)', async () => {
    mockGetUser.mockResolvedValue(AUTH)

    // No prev row → timeSinceLastSave = 0, but completion flips false→true
    const prevProgressChain = makeChain({ data: { completed: false, updated_at: null }, error: null })
    const progressUpsertChain = makeChain({ data: null, error: null })
    const showRowChain = makeChain({ data: { seconds_listened: 100, episodes_completed: 1 }, error: null })
    const showUpsertChain = makeChain({ data: null, error: null })
    const showUpsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    ;(showUpsertChain as Record<string, unknown>).upsert = showUpsertMock

    let listenDailyCalled = false
    let showCallCount = 0

    mockFrom.mockImplementation((table: string) => {
      if (table === 'playback_progress') return prevProgressChain
      if (table === 'listening_by_show') {
        showCallCount++
        return showCallCount === 1 ? showRowChain : showUpsertChain
      }
      if (table === 'listening_daily') { listenDailyCalled = true; return makeChain() }
      return progressUpsertChain
    })

    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      body: JSON.stringify({ guid: 'ep1', feedUrl: 'https://example.com/feed', positionSeconds: 60, completed: true }),
    })
    await POST(req)

    // listening_daily must NOT have been touched (secondsListened = 0)
    expect(listenDailyCalled).toBe(false)
    // episodes_completed: 1 + 1 = 2
    expect(showUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ episodes_completed: 2 }),
      expect.anything(),
    )
  })
})
