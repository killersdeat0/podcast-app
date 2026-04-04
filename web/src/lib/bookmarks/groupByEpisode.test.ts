import { describe, it, expect } from 'vitest'
import { groupByEpisode, type BookmarkItem } from './groupByEpisode'

const ep = (guid: string): BookmarkItem['episode'] => ({
  title: `Episode ${guid}`,
  podcastTitle: 'Test Podcast',
  artworkUrl: null,
  audioUrl: 'https://example.com/audio.mp3',
  duration: 3600,
})

function makeBookmark(overrides: Partial<BookmarkItem> & { id: string; guid: string; positionSeconds: number }): BookmarkItem {
  return {
    feedUrl: 'https://feed.example.com/rss',
    note: null,
    createdAt: '2026-04-01T00:00:00Z',
    episode: ep(overrides.guid),
    ...overrides,
  }
}

describe('groupByEpisode', () => {
  it('returns an empty array for no bookmarks', () => {
    expect(groupByEpisode([])).toEqual([])
  })

  it('groups bookmarks from the same episode into one group', () => {
    const bookmarks = [
      makeBookmark({ id: '1', guid: 'ep-a', positionSeconds: 120 }),
      makeBookmark({ id: '2', guid: 'ep-a', positionSeconds: 300 }),
    ]
    const groups = groupByEpisode(bookmarks)
    expect(groups).toHaveLength(1)
    expect(groups[0].guid).toBe('ep-a')
    expect(groups[0].bookmarks).toHaveLength(2)
  })

  it('creates separate groups for different episodes', () => {
    const bookmarks = [
      makeBookmark({ id: '1', guid: 'ep-a', positionSeconds: 60 }),
      makeBookmark({ id: '2', guid: 'ep-b', positionSeconds: 90 }),
    ]
    const groups = groupByEpisode(bookmarks)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.guid)).toEqual(['ep-a', 'ep-b'])
  })

  it('sorts timestamps ascending within each group', () => {
    const bookmarks = [
      makeBookmark({ id: '1', guid: 'ep-a', positionSeconds: 300 }),
      makeBookmark({ id: '2', guid: 'ep-a', positionSeconds: 60 }),
      makeBookmark({ id: '3', guid: 'ep-a', positionSeconds: 180 }),
    ]
    const groups = groupByEpisode(bookmarks)
    expect(groups[0].bookmarks.map((b) => b.positionSeconds)).toEqual([60, 180, 300])
  })

  it('separates episodes with the same guid but different feedUrls', () => {
    const bookmarks = [
      makeBookmark({ id: '1', guid: 'ep-a', feedUrl: 'https://feed1.com/rss', positionSeconds: 60 }),
      makeBookmark({ id: '2', guid: 'ep-a', feedUrl: 'https://feed2.com/rss', positionSeconds: 120 }),
    ]
    const groups = groupByEpisode(bookmarks)
    expect(groups).toHaveLength(2)
  })

  it('preserves episode metadata on the group from the first bookmark seen', () => {
    const bookmarks = [
      makeBookmark({ id: '1', guid: 'ep-a', positionSeconds: 60 }),
      makeBookmark({ id: '2', guid: 'ep-a', positionSeconds: 120 }),
    ]
    const groups = groupByEpisode(bookmarks)
    expect(groups[0].episode?.title).toBe('Episode ep-a')
  })
})
