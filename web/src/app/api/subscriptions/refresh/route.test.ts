import { describe, it, expect, vi, beforeEach } from 'vitest'

type QueryResult = { data?: unknown; error?: unknown }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete', 'not', 'neq', 'gt', 'gte', 'is']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const { mockGetUser, mockFrom, mockParseFeed } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockParseFeed: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/rss/parser', () => ({
  parseFeed: mockParseFeed,
}))

import { POST } from './route'

const ANON = { data: { user: null } }
const AUTH = { data: { user: { id: 'user-123' } } }

const STALE_SUB = {
  feed_url: 'https://feed.com/rss',
  last_visited_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
  last_feed_checked_at: null,
  episode_filter: null,
}

const FRESH_SUB = {
  ...STALE_SUB,
  last_feed_checked_at: new Date().toISOString(), // just checked
}

const FEED_WITH_EPISODES = {
  title: 'Test Podcast',
  episodes: [
    { guid: 'ep1', title: 'Episode 1', pubDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), audioUrl: 'https://a.mp3' },
    { guid: 'ep2', title: 'Episode 2', pubDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), audioUrl: 'https://b.mp3' },
    { guid: 'ep3', title: 'Old Episode', pubDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), audioUrl: 'https://c.mp3' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/subscriptions/refresh', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(ANON)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('skips fresh subscriptions and returns updated list', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const subsChain = makeChain({ data: [FRESH_SUB], error: null })
    const profileChain = makeChain({ data: { tier: 'free' }, error: null })
    // No final-select mockFrom: cooldown fires before reaching it
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)

    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockParseFeed).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).toHaveProperty('subscriptions')
  })

  it('fetches RSS and updates counts for stale subscriptions', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const subsChain = makeChain({ data: [STALE_SUB], error: null })
    const profileChain = makeChain({ data: { tier: 'free' }, error: null })
    const updateChain = makeChain({ data: null, error: null })
    const updatedChain = makeChain({ data: [{ ...STALE_SUB, new_episode_count: 2 }], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)      // subscriptions select
      .mockImplementationOnce(() => profileChain)   // user_profiles select
      .mockImplementationOnce(() => updateChain)    // subscriptions update
      .mockImplementationOnce(() => updatedChain)   // final subscriptions select

    mockParseFeed.mockResolvedValue(FEED_WITH_EPISODES)

    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockParseFeed).toHaveBeenCalledWith(STALE_SUB.feed_url)
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ new_episode_count: 2 })
    )
  })

  it('counts only episodes newer than last_visited_at for free users', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    // last_visited_at is 10 days ago; FEED_WITH_EPISODES has 2 episodes within 10 days, 1 older
    const subsChain = makeChain({ data: [STALE_SUB], error: null })
    const profileChain = makeChain({ data: { tier: 'free' }, error: null })
    const updateChain = makeChain({ data: null, error: null })
    const updatedChain = makeChain({ data: [], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => updatedChain)

    mockParseFeed.mockResolvedValue(FEED_WITH_EPISODES)

    await POST()
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ new_episode_count: 2 })
    )
  })

  it('returns 0 for free user with episode_filter set to empty string (opted out)', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const optedOutSub = { ...STALE_SUB, episode_filter: '' }
    const subsChain = makeChain({ data: [optedOutSub], error: null })
    const profileChain = makeChain({ data: { tier: 'free' }, error: null })
    const updateChain = makeChain({ data: null, error: null })
    const updatedChain = makeChain({ data: [], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => updatedChain)

    mockParseFeed.mockResolvedValue(FEED_WITH_EPISODES)

    await POST()
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ new_episode_count: 0 })
    )
  })

  it('returns 0 for paid user with null episode_filter (no notifications set)', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const subsChain = makeChain({ data: [STALE_SUB], error: null }) // episode_filter: null
    const profileChain = makeChain({ data: { tier: 'paid' }, error: null })
    const updateChain = makeChain({ data: null, error: null })
    const updatedChain = makeChain({ data: [], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => updatedChain)

    mockParseFeed.mockResolvedValue(FEED_WITH_EPISODES)

    await POST()
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ new_episode_count: 0 })
    )
  })

  it('filters by keyword for paid user with custom episode_filter', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const filteredSub = { ...STALE_SUB, episode_filter: 'episode 1' }
    const subsChain = makeChain({ data: [filteredSub], error: null })
    const profileChain = makeChain({ data: { tier: 'paid' }, error: null })
    const updateChain = makeChain({ data: null, error: null })
    const updatedChain = makeChain({ data: [], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)
      .mockImplementationOnce(() => updateChain)
      .mockImplementationOnce(() => updatedChain)

    mockParseFeed.mockResolvedValue(FEED_WITH_EPISODES)

    await POST()
    // Only "Episode 1" matches "episode 1" keyword; "Episode 2" and "Old Episode" don't
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ new_episode_count: 1 })
    )
  })

  it('silently skips feeds where parseFeed fails', async () => {
    mockGetUser.mockResolvedValue(AUTH)
    const subsChain = makeChain({ data: [STALE_SUB], error: null })
    const profileChain = makeChain({ data: { tier: 'free' }, error: null })
    const updatedChain = makeChain({ data: [], error: null })
    mockFrom
      .mockImplementationOnce(() => subsChain)
      .mockImplementationOnce(() => profileChain)
      .mockImplementationOnce(() => updatedChain)  // no update chain — should be skipped

    mockParseFeed.mockResolvedValue(null) // feed failure

    const res = await POST()
    // Should still return 200 with whatever is in the DB
    expect(res.status).toBe(200)
    // update should not have been called since feed failed
    expect(mockFrom).not.toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.any(Function) })
    )
  })
})
