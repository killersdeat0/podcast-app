'use client'

import { useEffect, useRef } from 'react'

export interface EqBarConfig {
  duration: string
  delay: string
}

/** Animated equalizer bars that drop from their current position to 0 on pause. */
export function EqBars({ playing, bars }: { playing: boolean; bars: EqBarConfig[] }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const rafIds = useRef<number[]>([])

  useEffect(() => {
    rafIds.current.forEach(cancelAnimationFrame)
    rafIds.current = []

    if (!playing) {
      refs.current.forEach((el) => {
        if (!el) return
        const matrix = window.getComputedStyle(el).transform
        let currentScaleY = 1
        if (matrix && matrix !== 'none') {
          const parts = matrix.replace('matrix(', '').replace(')', '').split(',')
          if (parts.length >= 4) currentScaleY = parseFloat(parts[3].trim())
        }
        // Remove the animation by name so it releases control of transform.
        // Using animationName (not shorthand) preserves --eq-dur/--eq-delay CSS vars.
        el.style.animationName = 'none'
        el.style.transform = `scaleY(${currentScaleY})`
        el.style.transition = 'none'
        const id1 = requestAnimationFrame(() => {
          const id2 = requestAnimationFrame(() => {
            if (el) {
              el.style.transition = 'transform 0.25s ease-out'
              el.style.transform = 'scaleY(0.2)'
            }
          })
          rafIds.current.push(id2)
        })
        rafIds.current.push(id1)
      })
    } else {
      refs.current.forEach((el) => {
        if (!el) return
        el.style.transition = ''
        // Restart the CSS animation: set name=none, reflow, then clear.
        // Clear transform AFTER reflow so there's no flash to full height.
        el.style.animationName = 'none'
        void el.offsetHeight
        el.style.transform = ''
        el.style.animationPlayState = ''
        el.style.animationName = ''
      })
    }
  }, [playing])

  return (
    <>
      {bars.map((bar, i) => (
        <span
          key={i}
          ref={(el) => { refs.current[i] = el }}
          className={`eq-bar${playing ? ' playing' : ''}`}
          // CSS custom properties are immune to animation shorthand resets
          style={{ '--eq-dur': bar.duration, '--eq-delay': bar.delay } as React.CSSProperties}
        />
      ))}
    </>
  )
}
