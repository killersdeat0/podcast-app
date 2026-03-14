import { describe, it, expect } from 'vitest'
import { hasNewEpisodes } from './hasNewEpisodes'

describe('hasNewEpisodes', () => {
  it('returns false when latest_episode_pub_date is null', () => {
    expect(hasNewEpisodes({ latest_episode_pub_date: null, last_visited_at: null })).toBe(false)
    expect(hasNewEpisodes({ latest_episode_pub_date: null, last_visited_at: '2024-03-10T00:00:00Z' })).toBe(false)
  })

  it('returns true when latest_episode_pub_date is set but last_visited_at is null', () => {
    expect(hasNewEpisodes({ latest_episode_pub_date: '2024-03-10T00:00:00Z', last_visited_at: null })).toBe(true)
  })

  it('returns true when latest episode is newer than last visit', () => {
    expect(hasNewEpisodes({
      latest_episode_pub_date: '2024-03-15T00:00:00Z',
      last_visited_at: '2024-03-10T00:00:00Z',
    })).toBe(true)
  })

  it('returns false when latest episode is older than last visit', () => {
    expect(hasNewEpisodes({
      latest_episode_pub_date: '2024-03-10T00:00:00Z',
      last_visited_at: '2024-03-15T00:00:00Z',
    })).toBe(false)
  })

  it('returns false when latest episode and last visit are the same time', () => {
    expect(hasNewEpisodes({
      latest_episode_pub_date: '2024-03-10T00:00:00Z',
      last_visited_at: '2024-03-10T00:00:00Z',
    })).toBe(false)
  })
})
