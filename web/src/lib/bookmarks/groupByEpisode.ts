export interface BookmarkItem {
  id: string
  feedUrl: string
  guid: string
  positionSeconds: number
  note: string | null
  createdAt: string
  episode: {
    title: string
    podcastTitle: string
    artworkUrl: string | null
    audioUrl: string
    duration: number | null
  } | null
}

export interface EpisodeGroup {
  key: string
  feedUrl: string
  guid: string
  episode: BookmarkItem['episode']
  bookmarks: BookmarkItem[]
}

export function groupByEpisode(bookmarks: BookmarkItem[]): EpisodeGroup[] {
  const map = new Map<string, EpisodeGroup>()
  for (const b of bookmarks) {
    const key = `${b.feedUrl}|${b.guid}`
    if (!map.has(key)) {
      map.set(key, { key, feedUrl: b.feedUrl, guid: b.guid, episode: b.episode, bookmarks: [] })
    }
    map.get(key)!.bookmarks.push(b)
  }
  for (const group of map.values()) {
    group.bookmarks.sort((a, b) => a.positionSeconds - b.positionSeconds)
  }
  return [...map.values()]
}
