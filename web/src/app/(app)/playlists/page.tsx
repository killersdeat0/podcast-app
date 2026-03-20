'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ListMusic, Lock, Globe, Plus, Trash2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { LIMITS } from '@/lib/limits'

interface Playlist {
  id: string
  name: string
  description: string | null
  is_public: boolean
  episode_count: number
  created_at: string
}

export default function PlaylistsPage() {
  const strings = useStrings()
  const { isGuest, tier } = useUser()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (isGuest) { setLoading(false); return }
    fetch('/api/playlists')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPlaylists(data) })
      .finally(() => setLoading(false))
  }, [isGuest])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) return
    setCreating(true)
    setCreateError('')
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || undefined }),
    })
    if (res.ok) {
      const { playlist } = await res.json()
      setPlaylists((prev) => [...prev, { ...playlist, episode_count: 0 }])
      window.dispatchEvent(new Event('playlists-changed'))
      setCreateOpen(false)
      setCreateName('')
      setCreateDesc('')
    } else {
      const data = await res.json()
      setCreateError(data.error ?? 'Error')
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(strings.playlists.delete_confirm)) return
    setDeletingId(id)
    try {
      await fetch(`/api/playlists/${id}`, { method: 'DELETE' })
      setPlaylists((prev) => prev.filter((p) => p.id !== id))
      window.dispatchEvent(new Event('playlists-changed'))
    } finally {
      setDeletingId(null)
    }
  }

  if (isGuest) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold mb-6">{strings.playlists.heading}</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold text-on-surface mb-2">{strings.playlists.auth_prompt_title}</p>
          <p className="text-sm text-on-surface-variant mb-6">{strings.playlists.guest_hint}</p>
          <Link href="/login" className="px-4 py-2 bg-brand hover:bg-brand text-on-surface rounded-lg text-sm font-medium transition-colors">
            {strings.auth.login_button}
          </Link>
        </div>
      </div>
    )
  }

  const atLimit = tier === 'free' && playlists.length >= LIMITS.free.playlistCount

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{strings.playlists.heading}</h1>
        <button
          onClick={() => { if (!atLimit) setCreateOpen(true) }}
          disabled={atLimit}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed text-on-surface rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {strings.playlists.create}
        </button>
      </div>

      {atLimit && (
        <div className="mb-4 p-3 bg-warning-container border border-warning rounded-lg text-sm text-on-warning-container">
          {strings.playlists.limit_reached_playlists}{' '}
          <a href="/upgrade" className="underline hover:text-on-warning-container">{strings.playlists.upgrade_cta}</a>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-surface-container rounded-xl animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold text-on-surface mb-2">{strings.playlists.empty_title}</p>
          <p className="text-sm text-on-surface-dim">{strings.playlists.empty_description}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((pl) => (
            <div key={pl.id} className="relative group bg-surface-container-low rounded-xl p-4 border border-outline-variant hover:border-outline-variant transition-colors">
              <Link href={`/playlist/${pl.id}`} className="block">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-container/40 flex items-center justify-center flex-shrink-0">
                    <ListMusic className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-on-surface truncate">{pl.name}</p>
                    {pl.description && (
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">{pl.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-on-surface-dim">
                  {pl.is_public ? (
                    <><Globe className="w-3 h-3" />{strings.playlists.public_badge}</>
                  ) : (
                    <><Lock className="w-3 h-3" />{strings.playlists.private_badge}</>
                  )}
                  <span className="ml-auto">{strings.playlists.episode_count.replace('{{n}}', String(pl.episode_count))}</span>
                </div>
              </Link>
              <button
                onClick={() => handleDelete(pl.id)}
                disabled={deletingId === pl.id}
                className="absolute top-3 right-3 p-1.5 text-on-surface-dim hover:text-error transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title={strings.playlists.delete}
              >
                {deletingId === pl.id
                  ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog.Root open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError('') } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
            <form onSubmit={handleCreate} className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
              <Dialog.Title className="text-lg font-semibold mb-4">{strings.playlists.create_modal_title}</Dialog.Title>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={strings.playlists.create_name_placeholder}
                className="w-full bg-surface-container text-on-surface rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder={strings.playlists.create_description_placeholder}
                rows={2}
                className="w-full bg-surface-container text-on-surface rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              {createError && <p className="text-error text-sm mb-3">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="px-4 py-2 bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg text-sm font-medium transition-colors"
                >
                  {creating ? '...' : strings.playlists.create_submit}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
