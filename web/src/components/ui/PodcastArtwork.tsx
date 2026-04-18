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
  const [imgError, setImgError] = useState(false)

  const letter = title?.trim()[0]?.toUpperCase() ?? '?'
  const color = MUTED_COLORS[simpleHash(title ?? '') % MUTED_COLORS.length]

  if (!src || imgError) {
    return (
      <div
        className={`${className ?? ''} flex items-center justify-center select-none [container-type:size]`}
        style={{ backgroundColor: color }}
      >
        <span className="font-bold text-white text-[45cqmin] leading-none">
          {letter}
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title ?? ''}
      role="img"
      className={className}
      onError={() => setImgError(true)}
    />
  )
}
