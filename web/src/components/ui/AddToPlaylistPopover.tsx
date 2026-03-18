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
  onSelect: (playlistId: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const strings = useStrings()

  const { refs, floatingStyles } = useFloating({
    open,
    placement: 'top-end',
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
        onClick={(e) => { e.stopPropagation(); if (!added) setOpen((o) => !o) }}
        title={strings.playlists.add_to_playlist}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
          added
            ? 'text-green-400 bg-green-500/10'
            : 'text-gray-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100'
        }`}
      >
        {added ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <ListPlus className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-20 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl flex flex-col max-h-72 w-52"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-700 flex-shrink-0">
            {strings.playlists.add_to_playlist}
          </p>
          {playlists.length > SEARCH_THRESHOLD && (
            <div className="px-2 py-1.5 border-b border-gray-700 flex-shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={strings.playlists.search_placeholder}
                className="w-full bg-gray-700 text-sm text-gray-200 placeholder-gray-500 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          )}
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-500 text-center">{strings.playlists.search_no_results}</p>
            ) : (
              filtered.map((pl) => (
                <button
                  key={pl.id}
                  onClick={(e) => { e.stopPropagation(); onSelect(pl.id); handleClose(); setAdded(true); setTimeout(() => setAdded(false), 1500) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
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
