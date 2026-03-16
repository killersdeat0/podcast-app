import { describe, it, expect } from 'vitest'
import { mergeEpisodeSources } from './mergeEpisodeSources'
import type { Episode } from '@/lib/rss/parser'

function ep(guid: string, title: string, extra: Partial<Episode> = {}): Episode {
  return {
    guid,
    title,
    audioUrl: `https://example.com/${guid}.mp3`,
    pubDate: '2024-01-01T00:00:00Z',
    duration: 3600,
    description: '',
    chapterUrl: null,
    ...extra,
  }
}

describe('mergeEpisodeSources', () => {
  it('returns RSS episodes as-is when iTunes list is empty', () => {
    const rss = [ep('a', 'Episode A'), ep('b', 'Episode B')]
    expect(mergeEpisodeSources(rss, [])).toEqual(rss)
  })

  it('appends iTunes episodes not present in RSS', () => {
    const rss = [ep('a', 'Episode A')]
    const itunes = [ep('b', 'Episode B (iTunes)')]
    const result = mergeEpisodeSources(rss, itunes)
    expect(result).toHaveLength(2)
    expect(result[0].guid).toBe('a')
    expect(result[1].guid).toBe('b')
  })

  it('RSS entry wins over iTunes entry with the same guid', () => {
    const rss = [ep('a', 'Episode A (RSS)', { description: 'rss description' })]
    const itunes = [ep('a', 'Episode A (iTunes)', { description: 'itunes description' })]
    const result = mergeEpisodeSources(rss, itunes)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Episode A (RSS)')
    expect(result[0].description).toBe('rss description')
  })

  it('preserves RSS order and appends iTunes-only episodes after', () => {
    const rss = [ep('c', 'C'), ep('a', 'A')]
    const itunes = [ep('a', 'A (iTunes)'), ep('b', 'B (iTunes)'), ep('d', 'D (iTunes)')]
    const result = mergeEpisodeSources(rss, itunes)
    expect(result.map((e) => e.guid)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('returns empty array when both sources are empty', () => {
    expect(mergeEpisodeSources([], [])).toEqual([])
  })

  it('returns iTunes episodes as-is when RSS list is empty', () => {
    const itunes = [ep('x', 'X'), ep('y', 'Y')]
    const result = mergeEpisodeSources([], itunes)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.guid)).toEqual(['x', 'y'])
  })
})
