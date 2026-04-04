'use client'

import { useState, useRef, useEffect } from 'react'
import { ListPlus, Check } from 'lucide-react'
import { useFloating, flip, shift, offset, autoUpdate } from '@floating-ui/react'
import { useStrings } from '@/lib/i18n/LocaleContext'

const SEARCH_THRESHOLD = 10

interface Playlist {
  id: string
  name: string
}

export default function AddToPlaylistPopover({
  playlists,
  onSelect,
  className = '',
}: {
  playlists: Playlist[]
  onSelect: (playlistId: string) => Promise<void>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const strings = useStrings()

  const { refs, floatingStyles } = useFloating({
    open,
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        refs.reference.current instanceof Element && refs.reference.current.contains(e.target as Node)
      ) return
      if (
        refs.floating.current instanceof Element && refs.floating.current.contains(e.target as Node)
      ) return
      setOpen(false)
      setQuery('')
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, refs.reference, refs.floating])

  useEffect(() => {
    if (open && playlists.length > SEARCH_THRESHOLD) searchRef.current?.focus()
    if (open) setQuery('')
  }, [open, playlists.length])

  if (playlists.length === 0) return null

  const filtered = query.trim()
    ? playlists.filter((pl) => pl.name.toLowerCase().includes(query.toLowerCase()))
    : playlists

  function handleClose() { setOpen(false); setQuery('') }

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <button
        ref={refs.setReference}
        onClick={(e) => { e.stopPropagation(); if (!added && !loading) setOpen((o) => !o) }}
        title={strings.playlists.add_to_playlist}
        disabled={loading}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
          added
            ? 'text-playback-indicator bg-playback-indicator/10'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high opacity-0 group-hover:opacity-100'
        }`}
      >
        {loading
          ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
          : added
            ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            : <ListPlus className="w-3.5 h-3.5" />
        }
      </button>
      {open && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-20 bg-surface-container border border-outline-variant rounded-lg overflow-hidden shadow-xl flex flex-col max-h-72 w-52"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant flex-shrink-0">
            {strings.playlists.add_to_playlist}
          </p>
          {playlists.length > SEARCH_THRESHOLD && (
            <div className="px-2 py-1.5 border-b border-outline-variant flex-shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={strings.playlists.search_placeholder}
                className="w-full bg-surface-container-high text-sm text-on-surface placeholder-on-surface-variant rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-on-surface-variant text-center">{strings.playlists.search_no_results}</p>
            ) : (
              filtered.map((pl) => (
                <button
                  key={pl.id}
                  onClick={async (e) => { e.stopPropagation(); handleClose(); setLoading(true); try { await onSelect(pl.id); setAdded(true); setTimeout(() => setAdded(false), 1500) } catch {} finally { setLoading(false) } }}
                  className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  {pl.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
