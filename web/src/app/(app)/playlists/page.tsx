'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ListMusic, Lock, Globe, Plus, Trash2 } from 'lucide-react'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { EmptyState } from '@/components/ui/EmptyState'

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
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' })
    setPlaylists((prev) => prev.filter((p) => p.id !== id))
    window.dispatchEvent(new Event('playlists-changed'))
  }

  if (isGuest) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold mb-6">{strings.playlists.heading}</h1>
        <EmptyState
          title={strings.playlists.auth_prompt_title}
          description={strings.playlists.guest_hint}
          cta={{ label: strings.auth.login_button, href: '/login' }}
        />
      </div>
    )
  }

  const atLimit = tier === 'free' && playlists.length >= 3

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{strings.playlists.heading}</h1>
        <button
          onClick={() => { if (!atLimit) setCreateOpen(true) }}
          disabled={atLimit}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {strings.playlists.create}
        </button>
      </div>

      {atLimit && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-300">
          {strings.playlists.limit_reached_playlists}{' '}
          <a href="/upgrade" className="underline hover:text-yellow-200">{strings.playlists.upgrade_cta}</a>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <EmptyState
          title={strings.playlists.empty_title}
          description={strings.playlists.empty_description}
          cta={{ label: strings.playlists.empty_cta, href: '/playlists' }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((pl) => (
            <div key={pl.id} className="relative group bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors">
              <Link href={`/playlist/${pl.id}`} className="block">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                    <ListMusic className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white truncate">{pl.name}</p>
                    {pl.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{pl.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
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
                className="absolute top-3 right-3 p-1.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title={strings.playlists.delete}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setCreateOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <form
              onSubmit={handleCreate}
              className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">{strings.playlists.create_modal_title}</h2>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={strings.playlists.create_name_placeholder}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-1 focus:ring-violet-500"
                autoFocus
              />
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder={strings.playlists.create_description_placeholder}
                rows={2}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
              {createError && <p className="text-red-400 text-sm mb-3">{createError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {creating ? '...' : strings.playlists.create_submit}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
