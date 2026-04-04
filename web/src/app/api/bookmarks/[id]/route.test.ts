import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type QueryResult = { data?: unknown; error?: unknown; count?: number | null }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'update', 'delete', 'not']) {
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

import { PATCH, DELETE } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeChain())
})

// ---------------------------------------------------------------------------
// PATCH /api/bookmarks/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/bookmarks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, params('bk-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when bookmark not found or not owned', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const chain = makeChain()
    chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    mockFrom.mockReturnValue(chain)
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, params('bk-1'))
    expect(res.status).toBe(404)
  })

  it('updates the note and returns the updated bookmark', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const updated = { id: 'bk-1', position_seconds: 120, note: 'updated note', created_at: '2026-04-01T00:00:00Z' }
    const chain = makeChain()
    chain.single = vi.fn().mockResolvedValue({ data: updated, error: null })
    mockFrom.mockReturnValue(chain)
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'updated note' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, params('bk-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.note).toBe('updated note')
    expect(body.positionSeconds).toBe(120)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/bookmarks/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/bookmarks/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', { method: 'DELETE' })
    const res = await DELETE(req, params('bk-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when bookmark not found or not owned', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null, count: 0 }))
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', { method: 'DELETE' })
    const res = await DELETE(req, params('bk-1'))
    expect(res.status).toBe(404)
  })

  it('returns 200 when bookmark is successfully deleted', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    mockFrom.mockReturnValue(makeChain({ data: null, error: null, count: 1 }))
    const req = new NextRequest('http://localhost/api/bookmarks/bk-1', { method: 'DELETE' })
    const res = await DELETE(req, params('bk-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
