/**
 * Per-show playback speed memory utilities.
 *
 * Paid users' preferred speed for each podcast is persisted in localStorage
 * under the key `podcast-speed-{feedUrl}`. On episode load the stored speed
 * is resolved and clamped to the active tier's available speed list.
 */

export const ALL_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
export const FREE_SPEEDS = [1, 2]

/** localStorage key for the global (cross-show) playback speed. */
export const GLOBAL_SPEED_KEY = 'playback-speed'

/** localStorage key for the per-show playback speed. */
export function perShowSpeedKey(feedUrl: string): string {
  return 'podcast-speed-' + feedUrl
}

/**
 * Snap `speed` to the nearest value in `validSpeeds`.
 * If `speed` is already in the list it is returned unchanged.
 */
export function snapToValidSpeed(speed: number, validSpeeds: number[]): number {
  if (validSpeeds.includes(speed)) return speed
  return validSpeeds.reduce((prev, curr) =>
    Math.abs(curr - speed) < Math.abs(prev - speed) ? curr : prev
  )
}

/**
 * Resolve the playback speed to use when loading an episode.
 *
 * Resolution order:
 * 1. Per-show speed from localStorage (`podcast-speed-{feedUrl}`)
 * 2. Falls back to `globalSpeed` (the current context speed) if no per-show value is stored
 *
 * For free-tier users the resolved speed is clamped to `Math.min(2, stored)` and
 * then snapped to the nearest value in `FREE_SPEEDS`.
 *
 * @param feedUrl      Feed URL of the episode being loaded
 * @param globalSpeed  Current global speed (from PlayerContext state)
 * @param isFreeTier   Whether the user is on the free tier
 * @param storage      localStorage-compatible object (injectable for testing)
 * @returns The speed that should be applied
 */
export function resolveEpisodeSpeed(
  feedUrl: string,
  globalSpeed: number,
  isFreeTier: boolean,
  storage: Pick<Storage, 'getItem'> = localStorage,
): number {
  const raw = storage.getItem(perShowSpeedKey(feedUrl))
  if (raw === null) return globalSpeed

  const perShowSpeed = Number(raw)
  if (isNaN(perShowSpeed)) return globalSpeed

  const validSpeeds = isFreeTier ? FREE_SPEEDS : ALL_SPEEDS
  const clamped = isFreeTier ? Math.min(2, perShowSpeed) : perShowSpeed
  return snapToValidSpeed(clamped, validSpeeds)
}

/**
 * Persist the chosen speed for a specific podcast (paid users only).
 *
 * Saves to:
 * - `playback-speed` (global default)
 * - `podcast-speed-{feedUrl}` (per-show)
 *
 * No-ops for free-tier users.
 *
 * @param speed      The chosen speed value
 * @param feedUrl    Feed URL of the currently-playing podcast (may be undefined)
 * @param isFreeTier Whether the user is on the free tier
 * @param storage    localStorage-compatible object (injectable for testing)
 */
export function saveSpeedPreference(
  speed: number,
  feedUrl: string | undefined,
  isFreeTier: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  if (isFreeTier) return
  storage.setItem(GLOBAL_SPEED_KEY, String(speed))
  if (feedUrl) {
    storage.setItem(perShowSpeedKey(feedUrl), String(speed))
  }
}
