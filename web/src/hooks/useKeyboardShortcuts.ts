import { useEffect } from 'react'

interface ShortcutActions {
  togglePlay: () => void
  seekBack: () => void
  seekForward: () => void
}

export function useKeyboardShortcuts({ togglePlay, seekBack, seekForward }: ShortcutActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
          seekBack()
          break
        case 'ArrowRight':
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
          seekForward()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, seekBack, seekForward])
}
