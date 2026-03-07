'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/discover', label: 'Discover', icon: '🔍' },
  { href: '/queue', label: 'Queue', icon: '≡' },
  { href: '/history', label: 'History', icon: '⏱' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-xl font-bold text-violet-400">PodSync</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
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
      </nav>
      <div className="px-3 py-4 border-t border-gray-800">
        <Link
          href="/login"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>⎋</span> Sign out
        </Link>
      </div>
    </aside>
  )
}
