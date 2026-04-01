/** Episode is considered complete when this % of duration has been played. */
export const COMPLETION_THRESHOLD_PCT = 98

/** How often (ms) live playback position is read from the audio element on progress-displaying pages. */
export const LIVE_POSITION_INTERVAL_MS = 1_000

/** Returns true for episodes that are meaningfully started but not yet finished. */
export function isInProgress(item: { completed: boolean; position_pct: number | null; position_seconds: number }): boolean {
  return !item.completed && item.position_seconds > 30 && item.position_pct !== null && item.position_pct < COMPLETION_THRESHOLD_PCT
}
