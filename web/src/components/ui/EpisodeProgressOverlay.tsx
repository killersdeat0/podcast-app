import { LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'

// CSS custom properties defined in globals.css
const FILL = 'var(--md-playback-fill)'
const FILL_ACTIVE = 'var(--md-playback-active-fill)'

/**
 * Renders the green background fill + pulsing bottom bar for episode cards.
 * Parent must have `relative overflow-hidden` for correct clipping.
 */
export function EpisodeProgressOverlay({ pct, isPlaying }: { pct: number | null; isPlaying: boolean }) {
  if (pct === null) return null
  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] ease-linear"
          style={{
            background: isPlaying ? FILL_ACTIVE : FILL,
            width: `${pct}%`,
            transitionDuration: `${LIVE_POSITION_INTERVAL_MS}ms`,
          }}
        />
      </div>
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-playback-indicator animate-pulse transition-[width] ease-linear"
            style={{ width: `${pct}%`, transitionDuration: `${LIVE_POSITION_INTERVAL_MS}ms` }}
          />
        </div>
      )}
    </>
  )
}
