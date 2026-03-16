import { describe, it, expect } from 'vitest'
import { mergeNewEpisodes } from './mergeNewEpisodes'
import type { Episode } from '@/lib/rss/parser'

function ep(guid: string, pubDate: string): Episode {
  return { guid, title: guid, audioUrl: '', pubDate, duration: null, description: '', chapterUrl: null }
}

describe('mergeNewEpisodes', () => {
  it('returns RSS episodes when stored list is empty', () => {
    const rss = [ep('a', '2024-06-03'), ep('b', '2024-06-02')]
    expect(mergeNewEpisodes(rss, [])).toEqual(rss)
  })

  it('returns stored episodes when RSS list is empty', () => {
    const stored = [ep('a', '2024-06-01')]
    const result = mergeNewEpisodes([], stored)
    expect(result).toHaveLength(1)
    expect(result[0].guid).toBe('a')
  })

  it('deduplicates episodes present in both lists (RSS takes priority by keeping RSS version)', () => {
    const rssEp = { ...ep('a', '2024-06-01'), title: 'RSS version' }
    const storedEp = { ...ep('a', '2024-06-01'), title: 'Stored version' }
    const result = mergeNewEpisodes([rssEp], [storedEp])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('RSS version')
  })

  it('appends stored episodes not in the RSS feed', () => {
    const rss = [ep('a', '2024-06-03'), ep('b', '2024-06-02')]
    const stored = [ep('c', '2024-05-15')]
    const result = mergeNewEpisodes(rss, stored)
    expect(result).toHaveLength(3)
    expect(result.map((e) => e.guid)).toContain('c')
  })

  it('sorts merged results newest-first', () => {
    const rss = [ep('new', '2024-06-10'), ep('mid', '2024-05-01')]
    const stored = [ep('old', '2024-03-15')]
    const result = mergeNewEpisodes(rss, stored)
    expect(result.map((e) => e.guid)).toEqual(['new', 'mid', 'old'])
  })

  it('handles stored episode newer than RSS episodes', () => {
    const rss = [ep('b', '2024-06-01')]
    const stored = [ep('a', '2024-07-01')]
    const result = mergeNewEpisodes(rss, stored)
    expect(result[0].guid).toBe('a')
    expect(result[1].guid).toBe('b')
  })

  it('returns empty array when both lists are empty', () => {
    expect(mergeNewEpisodes([], [])).toEqual([])
  })
})
