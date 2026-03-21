'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LIVE_POSITION_INTERVAL_MS } from '@/lib/player/constants'
import { EpisodeProgressOverlay } from '@/components/ui/EpisodeProgressOverlay'
import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Play, List, Globe, Lock, Link as LinkIcon, GripVertical, Trash2, Check, Pencil, ListMusic } from 'lucide-react'
import { toast } from 'sonner'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { usePlayer } from '@/components/player/PlayerContext'
import type { PlaylistEpisodeRef } from '@/components/player/PlayerContext'
import AuthPromptModal from '@/components/ui/AuthPromptModal'

interface PlaylistEpisode {
  id: string
  episode_guid: string
  feed_url: string
  position: number
  added_at: string
  episode: {
    title: string
    audio_url: string
    duration: number | null
    artwork_url: string | null
    podcast_title: string | null
    pub_date: string | null
    description: string | null
  } | null
  position_seconds: number
  position_pct: number | null
  completed: boolean
}

interface PlaylistData {
  id: string
  name: string
  description: string | null
  is_public: boolean
  user_id: string
}

function formatDuration(s: number | null) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTotalDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return ''
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h} hr ${m} min`
  return `${m} min`
}

function PlaylistCover({ artworkUrls, size = 120 }: { artworkUrls: string[]; size?: number }) {
  const validUrls = artworkUrls.filter(Boolean)

  if (validUrls.length === 0) {
    return (
      <div
        className="rounded-2xl overflow-hidden shadow-xl flex items-center justify-center bg-surface-container-high flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <ListMusic className="w-10 h-10 text-on-surface-variant" />
      </div>
    )
  }

  if (validUrls.length === 1) {
    return (
      <div
        className="rounded-2xl overflow-hidden shadow-xl flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={validUrls[0]} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  if (validUrls.length <= 3) {
    return (
      <div
        className="rounded-2xl overflow-hidden shadow-xl flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: size, height: size }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={validUrls[0]} alt="" className="w-full h-full object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={validUrls[1]} alt="" className="w-full h-full object-cover" />
          <div className="bg-surface-container col-span-2" />
        </div>
      </div>
    )
  }

  // 4+ images: true 2×2 grid
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-xl flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={validUrls[0]} alt="" className="w-full h-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={validUrls[1]} alt="" className="w-full h-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={validUrls[2]} alt="" className="w-full h-full object-cover" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={validUrls[3]} alt="" className="w-full h-full object-cover" />
      </div>
    </div>
  )
}

function SortableEpisodeRow({
  item,
  isOwner,
  inQueue,
  isPlaying,
  livePosition,
  liveDuration,
  onPlay,
  onRemove,
  onAddToQueue,
}: {
  item: PlaylistEpisode
  isOwner: boolean
  inQueue: boolean
  isPlaying: boolean
  livePosition: number
  liveDuration: number
  onPlay: (item: PlaylistEpisode) => void
  onRemove: (guid: string) => void
  onAddToQueue: (item: PlaylistEpisode) => void
}) {
  const strings = useStrings()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.episode_guid,
  })

  const posSeconds = isPlaying ? livePosition : item.position_seconds
  const livePct = isPlaying && liveDuration > 0 ? Math.min(100, Math.round((livePosition / liveDuration) * 100)) : null
  const storedPct = item.position_pct
  const durSeconds = item.episode?.duration ?? 0
  const pct = item.completed ? 100 : (livePct ?? storedPct ?? (isPlaying ? null : (posSeconds > 0 && durSeconds > 0 ? Math.min(100, Math.round((posSeconds / durSeconds) * 100)) : null)))

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      {isOwner && (
        <div
          {...attributes}
          {...listeners}
          className="p-2 text-on-surface-dim hover:text-on-surface-variant cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
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
        <div className="overflow-hidden flex-1">
          <p className="text-sm font-medium text-on-surface truncate">
            {item.episode?.title ?? item.episode_guid}
          </p>
          <div className="flex gap-2 mt-0.5">
            {item.episode?.podcast_title && (
              <span className="text-xs text-on-surface-variant truncate">{item.episode.podcast_title}</span>
            )}
            {item.episode?.duration && (
              <span className="text-xs text-on-surface-dim flex-shrink-0">{formatDuration(item.episode.duration)}</span>
            )}
          </div>
        </div>
      </button>
      <button
        onClick={() => onAddToQueue(item)}
        disabled={!item.episode}
        title={strings.playlists.add_to_queue}
        className={`p-2 transition-colors disabled:opacity-30 ${inQueue ? 'text-primary hover:text-error' : 'text-on-surface-variant hover:text-primary'}`}
      >
        {inQueue ? <Check className="w-4 h-4" /> : <List className="w-4 h-4" />}
      </button>
      {isOwner && (
        <button
          onClick={() => onRemove(item.episode_guid)}
          title={strings.playlists.remove_episode}
          className="p-2 text-on-surface-dim hover:text-error transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const strings = useStrings()
  const { isGuest, tier } = useUser()
  const { play, playPlaylist, nowPlaying, playing, audioRef } = usePlayer()
  const [livePosition, setLivePosition] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const sensors = useSensors(useSensor(PointerSensor))

  const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
  const [episodes, setEpisodes] = useState<PlaylistEpisode[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [queuedGuids, setQueuedGuids] = useState<Set<string>>(new Set())

  // Editing state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Copy link state
  const [copied, setCopied] = useState(false)

  const fetchPlaylist = useCallback(() => {
    fetch(`/api/playlists/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        setPlaylist(data.playlist)
        setEpisodes(data.episodes ?? [])
        setIsOwner(data.isOwner ?? false)
        setEditName(data.playlist.name)
        setEditDesc(data.playlist.description ?? '')
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchPlaylist() }, [fetchPlaylist])

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

  useEffect(() => {
    window.addEventListener('history-changed', fetchPlaylist)
    window.addEventListener('progress-saved', fetchPlaylist)
    return () => {
      window.removeEventListener('history-changed', fetchPlaylist)
      window.removeEventListener('progress-saved', fetchPlaylist)
    }
  }, [fetchPlaylist])

  useEffect(() => {
    if (isGuest) return
    function fetchQueuedGuids() {
      fetch('/api/queue')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setQueuedGuids(new Set(data.map((i: { episode_guid: string }) => i.episode_guid)))
        })
        .catch(() => {})
    }
    fetchQueuedGuids()
    window.addEventListener('queue-changed', fetchQueuedGuids)
    return () => window.removeEventListener('queue-changed', fetchQueuedGuids)
  }, [isGuest])

  function handlePlayAll() {
    if (episodes.length === 0) return
    const refs: PlaylistEpisodeRef[] = episodes
      .filter((e) => e.episode)
      .map((e) => ({
        guid: e.episode_guid,
        feedUrl: e.feed_url,
        title: e.episode!.title,
        podcastTitle: e.episode!.podcast_title ?? '',
        artworkUrl: e.episode!.artwork_url ?? '',
        audioUrl: e.episode!.audio_url,
        duration: e.episode!.duration ?? 0,
      }))
    playPlaylist(id, refs, 0)
  }

  function handlePlayEpisode(item: PlaylistEpisode) {
    if (!item.episode) return
    const refs: PlaylistEpisodeRef[] = episodes
      .filter((e) => e.episode)
      .map((e) => ({
        guid: e.episode_guid,
        feedUrl: e.feed_url,
        title: e.episode!.title,
        podcastTitle: e.episode!.podcast_title ?? '',
        artworkUrl: e.episode!.artwork_url ?? '',
        audioUrl: e.episode!.audio_url,
        duration: e.episode!.duration ?? 0,
      }))
    const startIndex = refs.findIndex((r) => r.guid === item.episode_guid)
    playPlaylist(id, refs, startIndex >= 0 ? startIndex : 0)
  }

  async function handleAddToQueue(item: PlaylistEpisode) {
    if (!item.episode) return
    const inQueue = queuedGuids.has(item.episode_guid)
    if (inQueue) {
      setQueuedGuids((prev) => { const s = new Set(prev); s.delete(item.episode_guid); return s })
      await fetch('/api/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid: item.episode_guid }),
      })
    } else {
      setQueuedGuids((prev) => new Set([...prev, item.episode_guid]))
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guid: item.episode_guid,
          feedUrl: item.feed_url,
          title: item.episode.title,
          audioUrl: item.episode.audio_url,
          artworkUrl: item.episode.artwork_url ?? '',
          podcastTitle: item.episode.podcast_title ?? '',
          duration: item.episode.duration,
          pubDate: item.episode.pub_date,
          description: item.episode.description,
        }),
      })
      if (res.status === 403) {
        setQueuedGuids((prev) => { const s = new Set(prev); s.delete(item.episode_guid); return s })
        toast.error(strings.queue.limit_reached_free)
        return
      }
    }
    window.dispatchEvent(new Event('queue-changed'))
  }

  async function handleRemoveEpisode(guid: string) {
    await fetch(`/api/playlists/${id}/episodes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid }),
    })
    setEpisodes((prev) => prev.filter((e) => e.episode_guid !== guid))
    window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId: id } }))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setEpisodes((prev) => {
      const oldIndex = prev.findIndex((e) => e.episode_guid === active.id)
      const newIndex = prev.findIndex((e) => e.episode_guid === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      fetch(`/api/playlists/${id}/episodes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedGuids: reordered.map((e) => e.episode_guid) }),
      }).catch(() => {})
      window.dispatchEvent(new CustomEvent('playlist-episodes-changed', { detail: { playlistId: id } }))
      return reordered
    })
  }

  async function handleTogglePublic() {
    if (!playlist) return
    const newVal = !playlist.is_public
    const res = await fetch(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: newVal }),
    })
    if (res.ok) {
      const { playlist: updated } = await res.json()
      setPlaylist(updated)
    }
  }

  async function handleSaveName() {
    if (!editName.trim()) return
    const res = await fetch(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
    })
    if (res.ok) {
      const { playlist: updated } = await res.json()
      setPlaylist(updated)
      window.dispatchEvent(new Event('playlists-changed'))
    }
    setEditingName(false)
  }

  async function handleDelete() {
    if (!confirm(strings.playlists.delete_confirm)) return
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' })
    window.dispatchEvent(new Event('playlists-changed'))
    router.push('/playlists')
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/playlist/${id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Suppress unused variable warning — play is available if needed for single-episode fallback
  void play

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="h-8 w-48 bg-surface-container rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (notFound || !playlist) {
    return (
      <div className="p-4 md:p-8">
        {!isGuest && (
          <>
            <p className="text-on-surface-variant">Playlist not found.</p>
            <Link href="/playlists" className="text-primary hover:text-primary text-sm mt-2 inline-block">
              ← Back to playlists
            </Link>
          </>
        )}
        <AuthPromptModal
          open={isGuest}
          onClose={() => {}}
          returnTo={pathname}
          title={strings.playlists.auth_prompt_shared_title}
          body={strings.playlists.auth_prompt_shared_body}
          dismissable={false}
        />
      </div>
    )
  }

  const overLimit = tier === 'free' && episodes.length > 10

  const artworkUrls = episodes
    .map((e) => e.episode?.artwork_url ?? null)
    .filter((url): url is string => !!url)

  const totalDurationSeconds = episodes.reduce((sum, e) => sum + (e.episode?.duration ?? 0), 0)

  return (
    <div className="p-4 md:p-8">
      {/* Back link */}
      <Link href="/playlists" className="text-xs text-on-surface-dim hover:text-on-surface-variant mb-4 inline-block">
        ← Playlists
      </Link>

      {/* Polished header */}
      <div className="flex items-end gap-5 mb-8 pt-2">
        <PlaylistCover artworkUrls={artworkUrls} size={100} />

        <div className="flex-1 min-w-0">
          {isOwner && editingName ? (
            <div className="flex flex-col gap-2 mb-2">
              <input
                ref={nameInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-2xl font-bold bg-surface-container text-on-surface rounded-lg px-3 py-1 outline-none focus:ring-1 focus:ring-primary w-full max-w-md"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                autoFocus
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={strings.playlists.create_description_placeholder}
                rows={2}
                className="bg-surface-container text-on-surface rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none w-full max-w-md"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  className="px-3 py-1 bg-brand hover:bg-brand text-on-brand rounded-lg text-sm"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-1 text-on-surface-variant hover:text-on-surface text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-on-surface truncate">{playlist.name}</h1>
                {isOwner && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 text-on-surface-dim hover:text-primary transition-colors flex-shrink-0"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
              {playlist.description && (
                <p className="text-on-surface-variant text-sm mb-1 truncate">{playlist.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-3">
                <span>{episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'}</span>
                {totalDurationSeconds > 0 && (
                  <>
                    <span className="text-on-surface-dim">·</span>
                    <span>{formatTotalDuration(totalDurationSeconds)}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Play all */}
                <button
                  onClick={handlePlayAll}
                  disabled={episodes.length === 0}
                  className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {strings.playlists.play}
                </button>

                {/* Public/private toggle (owner only) */}
                {isOwner && (
                  <button
                    onClick={handleTogglePublic}
                    className="flex items-center gap-2 px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg text-sm transition-colors"
                  >
                    {playlist.is_public ? (
                      <><Globe className="w-4 h-4" />{strings.playlists.make_private}</>
                    ) : (
                      <><Lock className="w-4 h-4" />{strings.playlists.make_public}</>
                    )}
                  </button>
                )}

                {/* Copy link (public playlists) */}
                {playlist.is_public && (
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg text-sm transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {copied ? strings.playlists.link_copied : strings.playlists.copy_link}
                  </button>
                )}

                {/* Delete (owner only) */}
                {isOwner && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-2 bg-surface-container hover:bg-error-container/50 text-on-surface-dim hover:text-error rounded-lg text-sm transition-colors"
                    title={strings.playlists.delete}
                  >
                    <Trash2 className="w-4 h-4" />
                    {strings.playlists.delete}
                  </button>
                )}

                {/* Public/private badge (non-owner) */}
                {!isOwner && (
                  <span className="flex items-center gap-1 text-xs text-on-surface-dim">
                    {playlist.is_public ? (
                      <><Globe className="w-3 h-3" />{strings.playlists.public_badge}</>
                    ) : (
                      <><Lock className="w-3 h-3" />{strings.playlists.private_badge}</>
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-outline-variant mb-4" />

      {/* Over-limit warning */}
      {overLimit && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-300">
          {strings.playlists.over_limit_episodes}{' '}
          <a href="/upgrade" className="underline hover:text-yellow-200">{strings.playlists.upgrade_cta}</a>
        </div>
      )}

      {/* Episode list */}
      {episodes.length === 0 ? (
        <p className="text-on-surface-variant text-sm">{strings.playlists.empty_description}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={isOwner ? handleDragEnd : () => {}}>
          <SortableContext items={episodes.map((e) => e.episode_guid)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {episodes.map((ep) => (
                <SortableEpisodeRow
                  key={ep.episode_guid}
                  item={ep}
                  isOwner={isOwner}
                  inQueue={queuedGuids.has(ep.episode_guid)}
                  isPlaying={nowPlaying?.guid === ep.episode_guid}
                  livePosition={livePosition}
                  liveDuration={liveDuration}
                  onPlay={handlePlayEpisode}
                  onRemove={handleRemoveEpisode}
                  onAddToQueue={handleAddToQueue}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AuthPromptModal
        open={isGuest}
        onClose={() => {}}
        returnTo={pathname}
        title={strings.playlists.auth_prompt_shared_title}
        body={strings.playlists.auth_prompt_shared_body}
        dismissable={false}
      />
    </div>
  )
}
