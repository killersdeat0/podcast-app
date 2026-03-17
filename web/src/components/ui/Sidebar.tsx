'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
import { Search, List, ListMusic, Clock, Zap, User, ChevronLeft, Menu, LogIn, LogOut, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { usePlayer } from '@/components/player/PlayerContext'
import AuthPromptModal from '@/components/ui/AuthPromptModal'
interface Subscription {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
  last_visited_at: string | null
  latest_episode_pub_date: string | null
  new_episode_count: number
}

interface Playlist {
  id: string
  name: string
  is_public: boolean
  episode_count: number
}

const navIcons = {
  discover: <Search className="w-4 h-4 flex-shrink-0" />,
  queue:    <List className="w-4 h-4 flex-shrink-0" />,
  playlists: <ListMusic className="w-4 h-4 flex-shrink-0" />,
  history:  <Clock className="w-4 h-4 flex-shrink-0" />,
  upgrade:  <Zap className="w-4 h-4 flex-shrink-0" />,
  profile:  <User className="w-4 h-4 flex-shrink-0" />,
}

function SortableSub({ sub, active }: { sub: Subscription; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sub.feed_url,
  })

  const href = sub.collection_id
    ? `/podcast/${sub.collection_id}`
    : `/podcast/${encodeURIComponent(sub.feed_url)}`

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 text-gray-700 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <Link
        href={href}
        className={`flex flex-1 items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors min-w-0 ${
          active ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <div className="relative w-6 h-6 flex-shrink-0">
          {sub.artwork_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sub.artwork_url} alt="" className="w-6 h-6 rounded object-cover" />
          ) : (
            <span className="w-6 h-6 rounded bg-gray-700 block" />
          )}
          {sub.new_episode_count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-violet-500 rounded-full border border-gray-900 flex items-center justify-center text-[9px] font-bold text-white leading-none">
              {sub.new_episode_count > 99 ? '99+' : sub.new_episode_count}
            </span>
          )}
        </div>
        <span className="truncate">{sub.title}</span>
      </Link>
    </div>
  )
}

export default function Sidebar({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [open, setOpen] = useState(defaultOpen)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [authPromptTitle, setAuthPromptTitle] = useState<string | undefined>()
  const [authReturnTo, setAuthReturnTo] = useState<string | undefined>()
  const sensors = useSensors(useSensor(PointerSensor))
  const strings = useStrings()
  const { isGuest, tier } = useUser()
  const { clearNowPlaying, clearClientQueue } = usePlayer()

  function openAuthPrompt(returnTo: string, title: string) {
    setAuthReturnTo(returnTo)
    setAuthPromptTitle(title)
    setAuthPromptOpen(true)
  }

  const navItems = [
    { href: '/discover',  label: strings.nav.discover,  icon: navIcons.discover,  guestModal: null },
    { href: '/queue',     label: strings.nav.queue,     icon: navIcons.queue,     guestModal: null },
    { href: '/playlists', label: strings.nav.playlists, icon: navIcons.playlists, guestModal: { title: strings.playlists.auth_prompt_title } },
    { href: '/history',   label: strings.nav.history,   icon: navIcons.history,   guestModal: { title: strings.guest.auth_prompt_history_title } },
    { href: '/upgrade',   label: strings.nav.upgrade,   icon: navIcons.upgrade,   guestModal: { title: strings.guest.auth_prompt_upgrade_title } },
    { href: '/profile',   label: strings.nav.profile,   icon: navIcons.profile,   guestModal: { title: strings.guest.auth_prompt_profile_title } },
  ]

  function toggleSidebar() {
    const next = !open
    setOpen(next)
    localStorage.setItem('sidebar-open', String(next))
    document.cookie = `sidebar-open=${next};path=/;max-age=31536000`
  }

  useEffect(() => {
    if (isGuest) return

    function fetchSubs() {
      fetch('/api/subscriptions')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setSubscriptions(data) })
        .catch(() => {})
    }

    async function maybeRefresh() {
      const lastCalled = Number(localStorage.getItem('feed_refresh_last_called') ?? 0)
      if (Date.now() - lastCalled < 60 * 60 * 1000) return
      localStorage.setItem('feed_refresh_last_called', String(Date.now()))
      const res = await fetch('/api/subscriptions/refresh', { method: 'POST' })
      if (!res.ok) return
      const { subscriptions } = await res.json()
      setSubscriptions(subscriptions)
    }

    fetchSubs()
    maybeRefresh()
    const interval = setInterval(maybeRefresh, 60 * 60 * 1000)
    window.addEventListener('subscriptions-changed', fetchSubs)
    return () => {
      clearInterval(interval)
      window.removeEventListener('subscriptions-changed', fetchSubs)
    }
  }, [isGuest])

  useEffect(() => {
    if (isGuest) return

    function fetchPlaylists() {
      fetch('/api/playlists')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setPlaylists(data) })
        .catch(() => {})
    }

    fetchPlaylists()
    window.addEventListener('playlists-changed', fetchPlaylists)
    return () => window.removeEventListener('playlists-changed', fetchPlaylists)
  }, [isGuest])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setSubscriptions((prev) => {
      const oldIndex = prev.findIndex((s) => s.feed_url === active.id)
      const newIndex = prev.findIndex((s) => s.feed_url === over.id)
      const reordered = arrayMove(prev, oldIndex, newIndex)
      fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedFeedUrls: reordered.map((s) => s.feed_url) }),
      }).catch(() => {})
      return reordered
    })
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearNowPlaying()
    clearClientQueue()
    localStorage.removeItem('guestToastShown')
    localStorage.removeItem('welcomeToastShownAt')
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className={`${open ? 'w-56' : 'w-14'} flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800 transition-[width] duration-200`}>
      <div className={`py-5 border-b border-gray-800 flex items-center min-w-0 ${open ? 'px-3 justify-between' : 'justify-center'}`}>
        {open && <span className="text-xl font-bold text-violet-400 truncate mr-2">PodSync</span>}
        <button
          onClick={toggleSidebar}
          className="text-gray-400 hover:text-white flex-shrink-0 p-1 rounded hover:bg-gray-800 transition-colors"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {!open && (
        <nav className="flex-1 flex flex-col items-center py-4 gap-1">
          {navItems.filter(({ href }) => !(href === '/upgrade' && tier === 'paid')).map(({ href, label, icon, guestModal }) => {
            const isActive = pathname.startsWith(href)
            const cls = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              isActive ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`
            if (isGuest && guestModal) {
              return (
                <button key={href} onClick={() => openAuthPrompt(href, guestModal.title)} className={cls} title={label}>
                  {icon}
                </button>
              )
            }
            return (
              <Link key={href} href={href} className={cls} title={label}>
                {icon}
              </Link>
            )
          })}
          <div className="flex-1" />
          {isGuest ? (
            <Link href="/login" className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors" title={strings.guest.toast_signin}>
              <LogIn className="w-4 h-4" />
            </Link>
          ) : (
            <button onClick={handleSignOut} className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors" title={strings.nav.sign_out}>
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </nav>
      )}

      {open && (
        <>
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.filter(({ href }) => !(href === '/upgrade' && tier === 'paid')).map(({ href, label, icon, guestModal }) => {
              const isActive = pathname.startsWith(href)
              const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
                isActive ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
              if (isGuest && guestModal) {
                return (
                  <button key={href} onClick={() => openAuthPrompt(href, guestModal.title)} className={cls}>
                    {icon}{label}
                  </button>
                )
              }
              return (
                <Link key={href} href={href} className={cls}>
                  {icon}{label}
                </Link>
              )
            })}

            <>
              <div className="flex items-center justify-between px-3 pt-4 pb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {strings.playlists.sidebar_heading}
                </p>
                {!isGuest && (
                  <Link
                    href="/playlists"
                    className="text-gray-500 hover:text-violet-400 transition-colors text-xs leading-none"
                    title="Manage playlists"
                  >
                    +
                  </Link>
                )}
              </div>
              {isGuest ? (
                <div className="px-3 py-1">
                  <p className="text-xs text-gray-600">{strings.playlists.guest_hint}</p>
                </div>
              ) : playlists.length === 0 ? (
                <div className="px-3 py-1">
                  <p className="text-xs text-gray-600">{strings.playlists.sidebar_empty_hint}</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {playlists.map((pl) => (
                    <Link
                      key={pl.id}
                      href={`/playlist/${pl.id}`}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        pathname.startsWith(`/playlist/${pl.id}`)
                          ? 'bg-violet-600 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{pl.name}</span>
                      <span className="ml-auto text-xs text-gray-500 flex-shrink-0">{pl.episode_count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>

            <>
              <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {strings.sidebar.my_podcasts}
              </p>
              {isGuest ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600">{strings.guest.sidebar_sign_in_hint}</p>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600 mb-2">{strings.sidebar.empty_hint}</p>
                  <Link
                    href="/discover"
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    {strings.sidebar.empty_cta} →
                  </Link>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={subscriptions.map((s) => s.feed_url)} strategy={verticalListSortingStrategy}>
                    {subscriptions.map((sub) => {
                      const isActive =
                        pathname.includes(encodeURIComponent(sub.feed_url)) ||
                        (!!sub.collection_id && pathname.includes(sub.collection_id))
                      return <SortableSub key={sub.feed_url} sub={sub} active={isActive} />
                    })}
                  </SortableContext>
                </DndContext>
              )}
            </>
          </nav>
          <div className="px-3 pt-1 pb-2 border-t border-gray-800">
            {isGuest ? (
              <Link
                href="/login"
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <LogIn className="w-4 h-4 flex-shrink-0" />
                {strings.guest.toast_signin}
              </Link>
            ) : (
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {strings.nav.sign_out}
              </button>
            )}
          </div>
        </>
      )}
      <AuthPromptModal
        open={authPromptOpen}
        onClose={() => setAuthPromptOpen(false)}
        returnTo={authReturnTo}
        title={authPromptTitle}
      />
    </aside>
  )
}
