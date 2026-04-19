'use client'

import { useEffect, useState } from 'react'

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
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    if (isGuest) return
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data: { theme?: Theme }) => {
        if (data.theme && (THEMES as string[]).includes(data.theme)) {
          setTheme(data.theme)
          applyTheme(data.theme)
          try { localStorage.setItem(STORAGE_KEY, data.theme) } catch {}
        }
      })
      .catch(() => {})
  }, [isGuest])

  function changeTheme(next: Theme) {
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
