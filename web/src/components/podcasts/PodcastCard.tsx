'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import type { ItunesResult } from '@/lib/itunes/search'

export function PodcastCard({ podcast }: { podcast: ItunesResult }) {
  const href = `/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}`

  return (
    <Link
      href={href}
      className="flex gap-4 bg-surface-container-low hover:bg-surface-container rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="relative group/card flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={podcast.artworkUrl600}
          alt={podcast.collectionName}
          className="w-16 h-16 rounded-lg object-cover"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 rounded-lg bg-scrim/0 group-hover/card:bg-scrim/40 transition-all duration-200 flex items-end justify-end p-1">
          <div className="translate-y-2 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100 transition-all duration-200">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Play className="w-3 h-3 text-on-primary fill-current ml-0.5" />
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-hidden">
        <p className="font-medium text-sm text-on-surface truncate">{podcast.collectionName}</p>
        <p className="text-xs text-on-surface-variant truncate mt-1">{podcast.artistName}</p>
        <p className="text-xs text-on-surface-variant mt-1">{podcast.primaryGenreName}</p>
      </div>
    </Link>
  )
}
