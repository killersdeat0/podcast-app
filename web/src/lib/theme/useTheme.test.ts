import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme, THEMES } from './useTheme'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('defaults to rose when nothing stored', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: null }) }))
    const { result } = renderHook(() => useTheme(false))
    expect(result.current.theme).toBe('rose')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('reads stored theme from localStorage on init', () => {
    localStorageMock.setItem('theme', 'amber')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'amber' }) }))
    const { result } = renderHook(() => useTheme(false))
    expect(result.current.theme).toBe('amber')
  })

  it('applies data-theme attribute when theme is not rose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'sky' }) }))
    const { result } = renderHook(() => useTheme(false))
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBe('sky')
  })

  it('removes data-theme attribute when theme is rose', async () => {
    document.documentElement.dataset.theme = 'violet'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ theme: 'rose' }) }))
    renderHook(() => useTheme(false))
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('changeTheme updates state, DOM, and localStorage', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }))
    const { result } = renderHook(() => useTheme(false))
    act(() => result.current.changeTheme('violet'))
    expect(result.current.theme).toBe('violet')
    expect(document.documentElement.dataset.theme).toBe('violet')
    expect(localStorageMock.getItem('theme')).toBe('violet')
  })

  it('skips API call for guest users', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useTheme(true))
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => result.current.changeTheme('amber'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
