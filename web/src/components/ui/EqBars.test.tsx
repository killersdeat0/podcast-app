import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EqBars } from './EqBars'

const THREE_BARS = [
  { duration: '0.9s', delay: '0s' },
  { duration: '0.7s', delay: '0.2s' },
  { duration: '1.1s', delay: '0.1s' },
]

const FOUR_BARS = [
  { duration: '0.6s', delay: '0ms' },
  { duration: '0.85s', delay: '160ms' },
  { duration: '0.7s', delay: '80ms' },
  { duration: '0.95s', delay: '240ms' },
]

// Stub requestAnimationFrame so imperative effects run synchronously in tests
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  // getComputedStyle returns 'none' by default in jsdom — treated as currentScaleY=1
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EqBars — rendering', () => {
  it('renders the correct number of bars', () => {
    const { container } = render(<EqBars playing bars={THREE_BARS} />)
    expect(container.querySelectorAll('span').length).toBe(3)
  })

  it('renders four bars when four configs are provided', () => {
    const { container } = render(<EqBars playing bars={FOUR_BARS} />)
    expect(container.querySelectorAll('span').length).toBe(4)
  })

  it('applies eq-bar class to every bar', () => {
    const { container } = render(<EqBars playing={false} bars={THREE_BARS} />)
    container.querySelectorAll('span').forEach((el) => {
      expect(el.className).toContain('eq-bar')
    })
  })
})

describe('EqBars — playing prop', () => {
  it('adds the "playing" class to all bars when playing=true', () => {
    const { container } = render(<EqBars playing bars={THREE_BARS} />)
    container.querySelectorAll('span').forEach((el) => {
      expect(el.className).toContain('playing')
    })
  })

  it('does not add the "playing" class when playing=false', () => {
    const { container } = render(<EqBars playing={false} bars={THREE_BARS} />)
    container.querySelectorAll('span').forEach((el) => {
      expect(el.className).not.toContain('playing')
    })
  })

  it('removes the "playing" class when playing transitions to false', () => {
    const { container, rerender } = render(<EqBars playing bars={THREE_BARS} />)
    rerender(<EqBars playing={false} bars={THREE_BARS} />)
    container.querySelectorAll('span').forEach((el) => {
      expect(el.className).not.toContain('playing')
    })
  })

  it('adds the "playing" class when playing transitions to true', () => {
    const { container, rerender } = render(<EqBars playing={false} bars={THREE_BARS} />)
    rerender(<EqBars playing bars={THREE_BARS} />)
    container.querySelectorAll('span').forEach((el) => {
      expect(el.className).toContain('playing')
    })
  })
})

describe('EqBars — CSS custom properties', () => {
  it('sets --eq-dur on each bar from the bars config', () => {
    const { container } = render(<EqBars playing bars={THREE_BARS} />)
    const spans = container.querySelectorAll('span')
    expect(spans[0].style.getPropertyValue('--eq-dur')).toBe('0.9s')
    expect(spans[1].style.getPropertyValue('--eq-dur')).toBe('0.7s')
    expect(spans[2].style.getPropertyValue('--eq-dur')).toBe('1.1s')
  })

  it('sets --eq-delay on each bar from the bars config', () => {
    const { container } = render(<EqBars playing bars={THREE_BARS} />)
    const spans = container.querySelectorAll('span')
    expect(spans[0].style.getPropertyValue('--eq-delay')).toBe('0s')
    expect(spans[1].style.getPropertyValue('--eq-delay')).toBe('0.2s')
    expect(spans[2].style.getPropertyValue('--eq-delay')).toBe('0.1s')
  })

  it('CSS vars survive a playing → not-playing transition', () => {
    const { container, rerender } = render(<EqBars playing bars={THREE_BARS} />)
    rerender(<EqBars playing={false} bars={THREE_BARS} />)
    const spans = container.querySelectorAll('span')
    // CSS custom props must not be wiped by the imperative animation code
    expect(spans[0].style.getPropertyValue('--eq-dur')).toBe('0.9s')
    expect(spans[0].style.getPropertyValue('--eq-delay')).toBe('0s')
  })

  it('CSS vars survive a not-playing → playing transition', () => {
    const { container, rerender } = render(<EqBars playing={false} bars={THREE_BARS} />)
    rerender(<EqBars playing bars={THREE_BARS} />)
    const spans = container.querySelectorAll('span')
    expect(spans[0].style.getPropertyValue('--eq-dur')).toBe('0.9s')
    expect(spans[0].style.getPropertyValue('--eq-delay')).toBe('0s')
  })
})

describe('EqBars — rAF cancellation', () => {
  it('cancels pending rAFs when playing flips quickly', () => {
    const cancelMock = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelMock)

    const { rerender } = render(<EqBars playing bars={THREE_BARS} />)
    // Trigger pause (schedules rAFs)
    rerender(<EqBars playing={false} bars={THREE_BARS} />)
    // Immediately resume — should cancel the pending rAFs
    rerender(<EqBars playing bars={THREE_BARS} />)

    expect(cancelMock).toHaveBeenCalled()
  })
})

describe('EqBars — accessibility', () => {
  it('renders spans (not interactive elements)', () => {
    const { container } = render(<EqBars playing bars={THREE_BARS} />)
    expect(container.querySelectorAll('button, a, input').length).toBe(0)
  })
})
