'use client'

import { useState } from 'react'

const MUTED_COLORS = [
  '#6d5a8a', // muted violet
  '#3d7a8a', // muted teal-blue
  '#4a7c59', // muted green
  '#8a6a3d', // muted amber
  '#8a3d3d', // muted red
  '#7a3d6d', // muted pink
  '#5a5a8a', // muted indigo
  '#3d6a6a', // muted teal
]

function simpleHash(str: string): number {
  let h = 0
  for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

interface PodcastArtworkProps {
  src?: string | null
  title?: string | null
  className?: string
}

export function PodcastArtwork({ src, title, className }: PodcastArtworkProps) {
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  const letter = title?.trim()[0]?.toUpperCase() ?? '?'
  const color = MUTED_COLORS[simpleHash(title ?? '') % MUTED_COLORS.length]

  const imgError = erroredSrc === src
  const imgLoaded = loadedSrc === src

  if (!src || imgError) {
    return (
      <div
        className={`${className ?? ''} flex items-center justify-center select-none [container-type:size]`}
        style={{ backgroundColor: color }}
      >
        <span className="font-bold text-[45cqmin] leading-none" style={{ color: 'white' }}>
          {letter}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`${className ?? ''} relative overflow-hidden [container-type:size]`}
      style={{ backgroundColor: color }}
    >
      {!imgLoaded && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold text-[45cqmin] leading-none select-none"
          style={{ color: 'white' }}
        >
          {letter}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title ?? ''}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setErroredSrc(src)}
      />
    </div>
  )
}
