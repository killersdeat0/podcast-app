export function hasNewEpisodes(sub: {
  latest_episode_pub_date: string | null
  last_visited_at: string | null
}): boolean {
  if (!sub.latest_episode_pub_date) return false
  if (!sub.last_visited_at) return true // subscribed but never visited
  return new Date(sub.latest_episode_pub_date) > new Date(sub.last_visited_at)
}
