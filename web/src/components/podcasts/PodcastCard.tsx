'use client'

import Link from 'next/link'
import type { ItunesResult } from '@/lib/itunes/search'
import { PodcastArtwork } from '@/components/ui/PodcastArtwork'

export function PodcastCard({ podcast }: { podcast: ItunesResult }) {
  return (
    <Link
      href={`/podcast/${podcast.collectionId}?feed=${encodeURIComponent(podcast.feedUrl)}`}
      className="flex gap-4 bg-surface-container-low hover:bg-surface-container rounded-xl p-4 transition-colors"
    >
      <PodcastArtwork
        src={podcast.artworkUrl600}
        title={podcast.collectionName}
        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
      />
      <div className="overflow-hidden">
        <p className="font-medium text-sm text-on-surface truncate">{podcast.collectionName}</p>
        <p className="text-xs text-on-surface-variant truncate mt-1">{podcast.artistName}</p>
        <p className="text-xs text-on-surface-variant mt-1">{podcast.primaryGenreName}</p>
      </div>
    </Link>
  )
}
