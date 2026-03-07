'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Subscription {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
}

const navItems = [
  { href: '/discover', label: 'Discover', icon: '🔍' },
  { href: '/queue', label: 'Queue', icon: '≡' },
  { href: '/history', label: 'History', icon: '⏱' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  useEffect(() => {
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSubscriptions(data)
      })
      .catch(() => {})
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-xl font-bold text-violet-400">PodSync</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith(href)
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}

        {subscriptions.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              My Podcasts
            </p>
            {subscriptions.map((sub) => {
              const href = sub.collection_id
                ? `/podcast/${sub.collection_id}?feed=${encodeURIComponent(sub.feed_url)}&title=${encodeURIComponent(sub.title)}&artwork=${encodeURIComponent(sub.artwork_url ?? '')}`
                : `/podcast/${encodeURIComponent(sub.feed_url)}?feed=${encodeURIComponent(sub.feed_url)}&title=${encodeURIComponent(sub.title)}&artwork=${encodeURIComponent(sub.artwork_url ?? '')}`
              return (
                <Link
                  key={sub.feed_url}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    pathname.includes(encodeURIComponent(sub.feed_url)) ||
                    (sub.collection_id && pathname.includes(sub.collection_id))
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {sub.artwork_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sub.artwork_url}
                      alt=""
                      className="w-6 h-6 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded bg-gray-700 flex-shrink-0" />
                  )}
                  <span className="truncate">{sub.title}</span>
                </Link>
              )
            })}
          </>
        )}
      </nav>
      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>⎋</span> Sign out
        </button>
      </div>
    </aside>
  )
}
