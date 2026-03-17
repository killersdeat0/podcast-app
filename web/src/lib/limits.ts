export const LIMITS = {
  free: {
    queue: 10,
    playlistCount: 3,
    playlistEpisodes: 10,
    subscriptions: 500,
  },
  paid: {
    queue: 500,
    playlistCount: 1000,
    playlistEpisodes: 500,
    subscriptions: 500,
  },
} as const
