export function SkeletonPodcastCard() {
  return (
    <div className="flex gap-4 bg-surface-container-low rounded-xl p-4 animate-pulse">
      <div className="w-16 h-16 rounded-lg bg-surface-container flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 bg-surface-container rounded w-3/4" />
        <div className="h-3 bg-surface-container rounded w-1/2" />
        <div className="h-3 bg-surface-container rounded w-1/4" />
      </div>
    </div>
  )
}

export function SkeletonEpisodeRow() {
  return (
    <div className="bg-surface-container-low rounded-xl px-5 py-4 animate-pulse space-y-2">
      <div className="h-3 bg-surface-container rounded w-2/3" />
      <div className="h-3 bg-surface-container rounded w-1/4" />
    </div>
  )
}
