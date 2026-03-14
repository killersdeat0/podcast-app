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
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface Subscription {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
}

const navIcons = {
  discover: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>,
  queue:    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>,
  history:  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>,
  upgrade:  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z"/></svg>,
  profile:  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
}

function SortableSub({ sub, active }: { sub: Subscription; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sub.feed_url,
  })

  const href = sub.collection_id
    ? `/podcast/${sub.collection_id}?feed=${encodeURIComponent(sub.feed_url)}&title=${encodeURIComponent(sub.title)}&artwork=${encodeURIComponent(sub.artwork_url ?? '')}`
    : `/podcast/${encodeURIComponent(sub.feed_url)}?feed=${encodeURIComponent(sub.feed_url)}&title=${encodeURIComponent(sub.title)}&artwork=${encodeURIComponent(sub.artwork_url ?? '')}`

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
        ⠿
      </div>
      <Link
        href={href}
        className={`flex flex-1 items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors min-w-0 ${
          active ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        {sub.artwork_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sub.artwork_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded bg-gray-700 flex-shrink-0" />
        )}
        <span className="truncate">{sub.title}</span>
      </Link>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [tier, setTier] = useState<'free' | 'paid' | null>(null)
  const [open, setOpen] = useState(true)
  const sensors = useSensors(useSensor(PointerSensor))
  const strings = useStrings()

  const navItems = [
    { href: '/discover', label: strings.nav.discover, icon: navIcons.discover },
    { href: '/queue',    label: strings.nav.queue,    icon: navIcons.queue },
    { href: '/history',  label: strings.nav.history,  icon: navIcons.history },
    { href: '/upgrade',  label: strings.nav.upgrade,  icon: navIcons.upgrade },
    { href: '/profile',  label: strings.nav.profile,  icon: navIcons.profile },
  ]

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-open')
    if (stored !== null) {
      setOpen(stored === 'true')
    } else {
      setOpen(window.innerWidth >= 768)
    }
  }, [])

  function toggleSidebar() {
    const next = !open
    setOpen(next)
    localStorage.setItem('sidebar-open', String(next))
  }

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => { if (data?.tier) setTier(data.tier) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function fetchSubs() {
      fetch('/api/subscriptions')
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setSubscriptions(data) })
        .catch(() => {})
    }
    fetchSubs()
    window.addEventListener('subscriptions-changed', fetchSubs)
    return () => window.removeEventListener('subscriptions-changed', fetchSubs)
  }, [])

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
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className={`${open ? 'w-56' : 'w-10'} flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800 transition-[width] duration-200`}>
      <div className="px-3 py-5 border-b border-gray-800 flex items-center justify-between min-w-0">
        {open && <span className="text-xl font-bold text-violet-400 truncate mr-2">PodSync</span>}
        <button
          onClick={toggleSidebar}
          className="text-gray-400 hover:text-white flex-shrink-0 p-1 rounded hover:bg-gray-800 transition-colors"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <>
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.filter(({ href }) => !(href === '/upgrade' && tier === 'paid')).map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {icon}
                {label}
              </Link>
            ))}

            <>
              <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {strings.sidebar.my_podcasts}
              </p>
              {subscriptions.length === 0 ? (
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
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>
              {strings.nav.sign_out}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
