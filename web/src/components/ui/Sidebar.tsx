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
import { Search, List, ListMusic, Clock, Bookmark, Zap, User, Settings, ChevronLeft, Menu, LogIn, LogOut, GripVertical } from 'lucide-react'
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

const navIcons = {
  discover: <Search className="w-4 h-4 flex-shrink-0" />,
  queue:    <List className="w-4 h-4 flex-shrink-0" />,
  playlists: <ListMusic className="w-4 h-4 flex-shrink-0" />,
  history:  <Clock className="w-4 h-4 flex-shrink-0" />,
  bookmarks: <Bookmark className="w-4 h-4 flex-shrink-0" />,
  upgrade:  <Zap className="w-4 h-4 flex-shrink-0" />,
  profile:  <User className="w-4 h-4 flex-shrink-0" />,
  settings: <Settings className="w-4 h-4 flex-shrink-0" />,
}

function SortableSub({ sub, active, isNowPlaying, playing }: { sub: Subscription; active: boolean; isNowPlaying: boolean; playing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sub.feed_url,
  })

  const href = sub.collection_id
    ? `/podcast/${sub.collection_id}`
    : `/podcast/${encodeURIComponent(sub.feed_url)}?title=${encodeURIComponent(sub.title ?? '')}${sub.artwork_url ? `&artwork=${encodeURIComponent(sub.artwork_url)}` : ''}`

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-0.5 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="pl-1 pr-0 py-0.5 text-on-surface-dim hover:text-on-surface-variant cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <Link
        href={href}
        prefetch={false}
        className={`flex flex-1 items-center gap-2 px-2 py-1 rounded-lg text-sm transition-colors min-w-0 ${
          isNowPlaying
            ? 'bg-now-playing-surface border-l-[3px] border-primary text-on-surface pl-[5px]'
            : active
            ? 'bg-surface-container text-on-surface font-medium'
            : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
        }`}
      >
        <div className="relative w-6 h-6 flex-shrink-0">
          {sub.artwork_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sub.artwork_url} alt="" className="w-6 h-6 rounded-md object-cover" />
          ) : (
            <span className="w-6 h-6 rounded-md bg-surface-container-high block" />
          )}
          {sub.new_episode_count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[12px] h-[12px] px-0.5 bg-brand rounded-full border border-surface flex items-center justify-center text-[8px] font-bold text-on-surface leading-none">
              {sub.new_episode_count > 99 ? '99+' : sub.new_episode_count}
            </span>
          )}
        </div>
        <span className="truncate flex-1">{sub.title}</span>
        <span
          className="flex items-end gap-px h-3 flex-shrink-0 transition-all duration-300"
          style={{ opacity: isNowPlaying && playing ? 1 : 0, transform: isNowPlaying && playing ? 'scale(1)' : 'scale(0.7)' }}
          aria-hidden
        >
          <span className={`eq-bar${playing ? ' playing' : ''}`} style={{ animationDuration: '0.9s', animationDelay: '0s' }} />
          <span className={`eq-bar${playing ? ' playing' : ''}`} style={{ animationDuration: '0.7s', animationDelay: '0.2s' }} />
          <span className={`eq-bar${playing ? ' playing' : ''}`} style={{ animationDuration: '1.1s', animationDelay: '0.1s' }} />
        </span>
      </Link>
    </div>
  )
}

export default function Sidebar({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [open, setOpen] = useState(defaultOpen)
  const [filter, setFilter] = useState('')
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [authPromptTitle, setAuthPromptTitle] = useState<string | undefined>()
  const [authReturnTo, setAuthReturnTo] = useState<string | undefined>()
  const sensors = useSensors(useSensor(PointerSensor))
  const strings = useStrings()
  const { isGuest, tier } = useUser()
  const { clearNowPlaying, clearClientQueue, nowPlaying, playing } = usePlayer()

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
    { href: '/bookmarks', label: strings.nav.bookmarks, icon: navIcons.bookmarks, guestModal: { title: strings.guest.auth_prompt_history_title } },
    { href: '/upgrade',   label: strings.nav.upgrade,   icon: navIcons.upgrade,   guestModal: { title: strings.guest.auth_prompt_upgrade_title } },
    { href: '/profile',   label: strings.nav.profile,   icon: navIcons.profile,   guestModal: { title: strings.guest.auth_prompt_profile_title } },
    { href: '/settings',  label: strings.nav.settings,  icon: navIcons.settings,  guestModal: null },
  ]

  function toggleSidebar() {
    const next = !open
    setOpen(next)
    if (!next) setFilter('')
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
    <aside className={`${open ? 'w-56' : 'w-14'} flex-shrink-0 bg-surface-container-low flex flex-col border-r border-outline-variant transition-[width] duration-200`}>
      <div className={`py-5 border-b border-outline-variant flex items-center min-w-0 ${open ? 'px-3 justify-between' : 'justify-center'}`}>
        {open && <span className="text-xl font-bold text-primary truncate mr-2">SyncPods</span>}
        <button
          onClick={toggleSidebar}
          className="text-on-surface-variant hover:text-on-surface flex-shrink-0 p-1 rounded hover:bg-surface-container transition-colors"
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
              isActive ? 'bg-brand text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
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
            <Link href="/login" className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title={strings.guest.toast_signin}>
              <LogIn className="w-4 h-4" />
            </Link>
          ) : (
            <button onClick={handleSignOut} className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title={strings.nav.sign_out}>
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
                isActive ? 'bg-brand text-on-surface' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
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
              <p className="px-3 pt-4 pb-1 text-xs font-semibold text-on-surface-dim uppercase tracking-wider">
                {strings.sidebar.my_podcasts}
              </p>
              {isGuest ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-on-surface-variant">{strings.guest.sidebar_sign_in_hint}</p>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="px-3 py-2">
                  <p className="text-xs text-on-surface-variant mb-2">{strings.sidebar.empty_hint}</p>
                  <Link
                    href="/discover"
                    className="text-xs text-primary hover:text-primary transition-colors"
                  >
                    {strings.sidebar.empty_cta} →
                  </Link>
                </div>
              ) : (
                <>
                  {subscriptions.length >= 5 && (
                    <div className="relative px-3 mb-1">
                      <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter podcasts..."
                        className="w-full text-xs px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-dim focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {filter && (
                        <button
                          onClick={() => setFilter('')}
                          className="absolute right-5 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-on-surface text-xs cursor-pointer"
                          aria-label="Clear filter"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                  {(() => {
                    const visibleSubs = filter.trim()
                      ? subscriptions.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()))
                      : subscriptions
                    if (visibleSubs.length === 0) {
                      return (
                        <p className="text-xs text-on-surface-variant px-3 py-2">No podcasts match &ldquo;{filter}&rdquo;</p>
                      )
                    }
                    return (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><div className="-mx-3">
                        <SortableContext items={subscriptions.map((s) => s.feed_url)} strategy={verticalListSortingStrategy}>
                          {visibleSubs.map((sub) => {
                            const podcastPath = sub.collection_id
                              ? `/podcast/${sub.collection_id}`
                              : `/podcast/${encodeURIComponent(sub.feed_url)}`
                            const isActive = pathname === podcastPath || pathname.startsWith(podcastPath + '?') || pathname.startsWith(podcastPath + '/')
                            const isNowPlaying = !!nowPlaying && nowPlaying.feedUrl === sub.feed_url
                            return <SortableSub key={sub.feed_url} sub={sub} active={isActive} isNowPlaying={isNowPlaying} playing={playing} />
                          })}
                        </SortableContext>
                      </div></DndContext>
                    )
                  })()}
                </>
              )}
            </>
          </nav>
          <div className="px-3 pt-1 pb-2 border-t border-outline-variant">
            {isGuest ? (
              <Link
                href="/login"
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <LogIn className="w-4 h-4 flex-shrink-0" />
                {strings.guest.toast_signin}
              </Link>
            ) : (
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
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
