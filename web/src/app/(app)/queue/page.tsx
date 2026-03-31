'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'
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
import { useUser } from '@/lib/auth/UserContext'
import AddToPlaylistPopover from '@/components/ui/AddToPlaylistPopover'
import { Info } from 'lucide-react'
import DOMPurify from 'dompurify'
import { EpisodeProgressOverlay } from '@/components/ui/EpisodeProgressOverlay'
import { useUserPlaylists } from '@/hooks/useUserPlaylists'
import { addEpisodeToPlaylist } from '@/lib/playlists/addEpisodeToPlaylist'

interface QueueItem {
  episode_guid: string
  feed_url: string
  position: number
  position_seconds: number
  position_pct: number | null
  episode: {
    title: string
    audio_url: string
    duration: number | null
    artwork_url: string | null
    podcast_title: string | null
    description: string | null
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
  playlists,
  onAddToPlaylist,
  isPlaying,
  livePosition,
  liveDuration,
  openDescGuid,
  onToggleDesc,
}: {
  item: QueueItem
  onPlay: (item: QueueItem) => void
  onRemove: (guid: string) => Promise<void>
  playlists: Array<{ id: string; name: string }>
  onAddToPlaylist: (playlistId: string, item: QueueItem) => Promise<void>
  isPlaying: boolean
  livePosition: number
  liveDuration: number
  openDescGuid: string | null
  onToggleDesc: (guid: string) => void
}) {
  const [removing, setRemoving] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.episode_guid,
  })

  const posSeconds = isPlaying ? livePosition : item.position_seconds
  const livePct = isPlaying && liveDuration > 0 ? Math.min(100, Math.round((livePosition / liveDuration) * 100)) : null
  const storedPct = item.position_pct
  const durSeconds = item.episode?.duration ?? 0
  const pct = livePct ?? storedPct ?? (isPlaying ? null : (posSeconds > 0 && durSeconds > 0 ? Math.min(100, Math.round((posSeconds / durSeconds) * 100)) : null))
  const description = item.episode?.description ?? null
  const showDesc = openDescGuid === item.episode_guid

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-50' : ''}
    >
      <div className="group flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="p-2 text-on-surface-dim hover:text-on-surface-variant cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder"
        >
          ⠿
        </div>
        <button
          onClick={() => onPlay(item)}
          disabled={!item.episode}
          className={`relative flex-1 flex items-center gap-3 text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-50 overflow-hidden ${isPlaying ? 'bg-now-playing-surface hover:bg-now-playing-surface' : 'bg-surface-container-low hover:bg-surface-container'}`}
        >
          <EpisodeProgressOverlay pct={pct} isPlaying={isPlaying} />
          {item.episode?.artwork_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.episode.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
          )}
          <div className="overflow-hidden">
            <p className="text-sm font-medium text-on-surface truncate">
              {item.episode?.title ?? item.episode_guid}
            </p>
            <div className="flex gap-2 mt-0.5">
              {item.episode?.podcast_title && (
                <span className="text-xs text-on-surface-variant truncate">{item.episode.podcast_title}</span>
              )}
              {item.episode?.duration && (
                <span className="text-xs text-on-surface-dim">{formatDuration(item.episode.duration)}</span>
              )}
            </div>
          </div>
        </button>
        {description && (
          <button
            onClick={() => onToggleDesc(item.episode_guid)}
            title="Show description"
            className={`p-2 transition-colors ${showDesc ? 'text-primary' : 'text-on-surface-dim hover:text-on-surface-variant'}`}
          >
            <Info className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={async () => { setRemoving(true); try { await onRemove(item.episode_guid) } finally { setRemoving(false) } }}
          disabled={removing}
          title="Remove from queue"
          className="p-3 text-on-surface-dim hover:text-error transition-colors disabled:opacity-50"
        >
          {removing
            ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
            : '✕'}
        </button>
        {playlists.length > 0 && (
          <AddToPlaylistPopover
            playlists={playlists}
            onSelect={(playlistId) => onAddToPlaylist(playlistId, item)}
          />
        )}
      </div>
      {description && (
        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${showDesc ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
          <div
            className="pl-16 pr-4 pb-3 pt-1 text-sm text-on-surface-variant [&_a]:text-primary [&_a]:underline [&_p]:mb-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }}
          />
        </div>
      )}
    </div>
  )
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const { play, clientQueue, dequeueClient, nowPlaying, playing, audioRef } = usePlayer()
  const [livePosition, setLivePosition] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const { isGuest } = useUser()
  const userPlaylists = useUserPlaylists(isGuest)
  const strings = useStrings()

  const [openDescGuid, setOpenDescGuid] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor))
  const reorderInProgressRef = useRef(false)

  const fetchQueue = useCallback(() => {
    if (reorderInProgressRef.current) return
    fetch('/api/queue')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isGuest) {
      setLoading(false)
      return
    }
    fetch('/api/queue')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setItems(data) })
      .finally(() => setLoading(false))
  }, [isGuest])

  useEffect(() => {
    if (isGuest) return
    window.addEventListener('queue-changed', fetchQueue)
    window.addEventListener('progress-saved', fetchQueue)
    return () => {
      window.removeEventListener('queue-changed', fetchQueue)
      window.removeEventListener('progress-saved', fetchQueue)
    }
  }, [isGuest, fetchQueue])

  useLayoutEffect(() => {
    setLivePosition(0)
    setLiveDuration(0)
  }, [nowPlaying?.guid])

  useEffect(() => {
    const audio = audioRef.current
    if (!playing && audio && nowPlaying) {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!nowPlaying) return
    const id = setInterval(() => {
      if (audioRef.current) {
        setLivePosition(audioRef.current.currentTime)
        setLiveDuration(audioRef.current.duration || 0)
      }
    }, LIVE_POSITION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [nowPlaying, audioRef])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !nowPlaying) return
    const onSeeked = () => {
      setLivePosition(audio.currentTime)
      setLiveDuration(audio.duration || 0)
    }
    audio.addEventListener('seeked', onSeeked)
    return () => audio.removeEventListener('seeked', onSeeked)
  }, [nowPlaying, audioRef])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.episode_guid === active.id)
      const newIndex = prev.findIndex((i) => i.episode_guid === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      reorderInProgressRef.current = true
      fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedGuids: reordered.map((i) => i.episode_guid) }),
      })
        .then(() => {
          // dispatchEvent is synchronous — fetchQueue runs and sees ref=true, skips the fetch.
          // The Player's refreshDbQueue is a separate listener and still runs normally.
          window.dispatchEvent(new Event('queue-changed'))
          reorderInProgressRef.current = false
        })
        .catch(() => { reorderInProgressRef.current = false })
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
    window.dispatchEvent(new Event('queue-changed'))
  }

  function addItemToPlaylist(playlistId: string, item: QueueItem): Promise<void> {
    if (!item.episode) return Promise.resolve()
    return addEpisodeToPlaylist(playlistId, {
      guid: item.episode_guid,
      feedUrl: item.feed_url,
      title: item.episode.title,
      audioUrl: item.episode.audio_url,
      artworkUrl: item.episode.artwork_url ?? '',
      podcastTitle: item.episode.podcast_title ?? '',
      duration: item.episode.duration ?? undefined,
    })
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
      description: item.episode.description || undefined,
    })
  }

  if (isGuest) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold mb-4">{strings.queue.heading}</h1>
        <div className="flex items-start gap-3 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-on-surface-variant flex-1">
            {strings.guest.queue_sync_hint}{' '}
            <a href="/login" className="text-primary hover:text-primary font-medium">{strings.guest.queue_sync_cta}</a>
          </p>
        </div>
        {clientQueue.length === 0 ? (
          <EmptyState
            title={strings.queue.empty_title}
            description={strings.queue.empty_description}
            cta={{ label: strings.queue.empty_cta, href: '/discover' }}
          />
        ) : (
          <div className="space-y-2">
            {clientQueue.map((ep) => (
              <div key={ep.guid} className="flex items-center gap-2">
                <button
                  onClick={() => play(ep)}
                  className="flex-1 flex items-center gap-3 text-left bg-surface-container-low hover:bg-surface-container rounded-xl px-4 py-3 transition-colors"
                >
                  {ep.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ep.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex-shrink-0" />
                  )}
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-on-surface truncate">{ep.title}</p>
                    <p className="text-xs text-on-surface-variant truncate">{ep.podcastTitle}</p>
                  </div>
                </button>
                <button
                  onClick={() => dequeueClient(ep.guid)}
                  title="Remove from queue"
                  className="p-3 text-on-surface-variant hover:text-error transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{strings.queue.heading}</h1>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={strings.queue.empty_title}
          description={strings.queue.empty_description}
          cta={{ label: strings.queue.empty_cta, href: '/discover' }}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setOpenDescGuid(null)} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.episode_guid)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item) => (
                <SortableQueueItem
                  key={item.episode_guid}
                  item={item}
                  onPlay={playItem}
                  onRemove={removeFromQueue}
                  playlists={userPlaylists}
                  onAddToPlaylist={addItemToPlaylist}
                  isPlaying={nowPlaying?.guid === item.episode_guid && playing}
                  livePosition={livePosition}
                  liveDuration={liveDuration}
                  openDescGuid={openDescGuid}
                  onToggleDesc={(guid) => setOpenDescGuid((prev) => prev === guid ? null : guid)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
