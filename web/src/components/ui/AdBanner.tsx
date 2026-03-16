'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStrings } from '@/lib/i18n/LocaleContext'

export default function AdBanner() {
  const [dismissed, setDismissed] = useState(false)
  const s = useStrings()
  if (dismissed) return null

  return (
    <div className="flex items-center justify-between bg-gray-800 border-b border-gray-700 px-6 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad</span>
        <span className="text-gray-300">
          {s.ad_banner.message}{' '}
          <Link href="/upgrade" className="text-violet-400 hover:text-violet-300 underline">
            {s.ad_banner.upgrade_link}
          </Link>{' '}
          {s.ad_banner.suffix}
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-500 hover:text-white transition-colors ml-4 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
