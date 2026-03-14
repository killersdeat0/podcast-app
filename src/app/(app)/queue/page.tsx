'use client'

import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePlayer } from '@/components/player/PlayerContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface QueueItem {
  episode_guid: string
  feed_url: string
  position: number
  episode: {
    title: string
    audio_url: string
    duration: number | null
    artwork_url: string | null
    podcast_title: string | null
  } | null
}

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function SortableQueueItem({
  item,
  onPlay,
  onRemove,
}: {
  item: QueueItem
  onPlay: (item: QueueItem) => void
  onRemove: (guid: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.episode_guid,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-2 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        ⠿
      </div>
      <button
        onClick={() => onPlay(item)}
        disabled={!item.episode}
        className="flex-1 flex items-center gap-3 text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
      >
        {item.episode?.artwork_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.episode.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-700 flex-shrink-0" />
        )}
        <div className="overflow-hidden">
          <p className="text-sm font-medium text-white truncate">
            {item.episode?.title ?? item.episode_guid}
          </p>
          <div className="flex gap-2 mt-0.5">
            {item.episode?.podcast_title && (
              <span className="text-xs text-gray-400 truncate">{item.episode.podcast_title}</span>
            )}
            {item.episode?.duration && (
              <span className="text-xs text-gray-500">{formatDuration(item.episode.duration)}</span>
            )}
          </div>
        </div>
      </button>
      <button
        onClick={() => onRemove(item.episode_guid)}
        title="Remove from queue"
        className="p-3 text-gray-500 hover:text-red-400 transition-colors"
      >
        ✕
      </button>
    </div>
  )
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const { play } = usePlayer()
  const strings = useStrings()

  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => {
    fetch('/api/queue')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .finally(() => setLoading(false))
  }, [])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.episode_guid === active.id)
      const newIndex = prev.findIndex((i) => i.episode_guid === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedGuids: reordered.map((i) => i.episode_guid) }),
      }).catch(() => {})
      return reordered
    })
  }

  async function removeFromQueue(guid: string) {
    await fetch('/api/queue', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid }),
    })
    setItems((prev) => prev.filter((i) => i.episode_guid !== guid))
  }

  function playItem(item: QueueItem) {
    if (!item.episode) return
    play({
      guid: item.episode_guid,
      feedUrl: item.feed_url,
      title: item.episode.title,
      podcastTitle: item.episode.podcast_title ?? '',
      artworkUrl: item.episode.artwork_url ?? '',
      audioUrl: item.episode.audio_url,
      duration: item.episode.duration ?? 0,
    })
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">{strings.queue.heading}</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={strings.queue.empty_title}
          description={strings.queue.empty_description}
          cta={{ label: strings.queue.empty_cta, href: '/discover' }}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.episode_guid)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item) => (
                <SortableQueueItem
                  key={item.episode_guid}
                  item={item}
                  onPlay={playItem}
                  onRemove={removeFromQueue}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
