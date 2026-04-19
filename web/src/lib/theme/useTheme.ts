'use client'

import { useEffect, useRef, useState } from 'react'

export type Theme = 'rose' | 'amber' | 'sky' | 'violet'
export const THEMES: Theme[] = ['rose', 'amber', 'sky', 'violet']

const STORAGE_KEY = 'theme'

function applyTheme(theme: Theme) {
  if (theme === 'rose') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.dataset.theme = theme
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (THEMES as string[]).includes(stored)) return stored as Theme
  } catch {}
  return 'rose'
}

export function useTheme(isGuest: boolean) {
  // Initialize with 'rose' on both server and client to avoid hydration mismatch.
  // localStorage is read in useEffect (client-only).
  const [theme, setTheme] = useState<Theme>('rose')
  const userChangedRef = useRef(false)

  useEffect(() => {
    // Step 1: sync from localStorage (fast, no network)
    const stored = readStoredTheme()
    if (!userChangedRef.current) {
      setTheme(stored)
      applyTheme(stored)
    }

    // Step 2: reconcile with DB (authoritative)
    if (isGuest) return
    let cancelled = false
    const controller = new AbortController()

    fetch('/api/profile', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        return r.json()
      })
      .then((data: { theme?: Theme }) => {
        if (cancelled || userChangedRef.current) return
        if (data.theme && (THEMES as string[]).includes(data.theme)) {
          setTheme(data.theme)
          applyTheme(data.theme)
          try { localStorage.setItem(STORAGE_KEY, data.theme) } catch {}
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isGuest])

  function changeTheme(next: Theme) {
    userChangedRef.current = true
    setTheme(next)
    applyTheme(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    if (!isGuest) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {})
    }
  }

  return { theme, changeTheme }
}
