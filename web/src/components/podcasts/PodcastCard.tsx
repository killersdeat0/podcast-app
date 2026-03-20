'use client'

import Link from 'next/link'
import type { ItunesResult } from '@/lib/itunes/search'

export function PodcastCard({ podcast }: { podcast: ItunesResult }) {
  return (
    <Link
      href={`/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}`}
      className="flex gap-4 bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={podcast.artworkUrl600}
        alt={podcast.collectionName}
        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
      />
      <div className="overflow-hidden">
        <p className="font-medium text-sm text-white truncate">{podcast.collectionName}</p>
        <p className="text-xs text-gray-400 truncate mt-1">{podcast.artistName}</p>
        <p className="text-xs text-gray-500 mt-1">{podcast.primaryGenreName}</p>
      </div>
    </Link>
  )
}
