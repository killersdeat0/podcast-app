'use client'

import { useState } from 'react'
import { ListPlus, Check } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useStrings } from '@/lib/i18n/LocaleContext'

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
  const strings = useStrings()
  useEscapeKey(() => setOpen(false), open)

  if (playlists.length === 0) return null

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <button
        onClick={(e) => { e.stopPropagation(); if (!added) setOpen(true) }}
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
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden z-20 min-w-[180px] shadow-xl">
            <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-700">
              {strings.playlists.add_to_playlist}
            </p>
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={(e) => { e.stopPropagation(); onSelect(pl.id); setOpen(false); setAdded(true); setTimeout(() => setAdded(false), 1500) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                {pl.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
