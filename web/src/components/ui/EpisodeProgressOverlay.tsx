import { useLayoutEffect, useRef, useState } from 'react'
import { LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'

// CSS custom properties defined in globals.css
const FILL = 'var(--md-playback-fill)'
const FILL_ACTIVE = 'var(--md-playback-active-fill)'

/**
 * Renders the green background fill + pulsing bottom bar for episode cards.
 * Parent must have `relative overflow-hidden` for correct clipping.
 */
export function EpisodeProgressOverlay({ pct, isPlaying }: { pct: number | null; isPlaying: boolean }) {
  const prevPctRef = useRef<number | null>(null)
  const [goingBackward, setGoingBackward] = useState(false)
  useLayoutEffect(() => {
    setGoingBackward(pct !== null && prevPctRef.current !== null && pct < prevPctRef.current - 5)
    prevPctRef.current = pct
  }, [pct])

  if (pct === null) return null
  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{
            background: isPlaying ? FILL_ACTIVE : FILL,
            width: `${pct}%`,
            transition: (!isPlaying || goingBackward) ? 'none' : `width ${LIVE_POSITION_INTERVAL_MS}ms linear`,
            boxShadow: isPlaying ? '2px 0 8px rgba(74, 222, 128, 0.5)' : undefined,
          }}
        >
          {isPlaying && (
            <div
              className="absolute inset-y-0 w-1/4"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                animation: 'progress-shimmer 10s ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-playback-indicator animate-pulse"
            style={{ width: `${pct}%`, transition: goingBackward ? 'none' : `width ${LIVE_POSITION_INTERVAL_MS}ms linear` }}
          />
        </div>
      )}
    </>
  )
}
