'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStrings } from '@/lib/i18n/LocaleContext'

export default function AdBanner() {
  const [dismissed, setDismissed] = useState(false)
  const s = useStrings()
  if (dismissed) return null

  return (
    <div className="flex items-center justify-between bg-surface-container border-b border-outline-variant px-6 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Ad</span>
        <span className="text-on-surface">
          {s.ad_banner.message}{' '}
          <Link href="/upgrade" className="text-primary hover:text-primary underline">
            {s.ad_banner.upgrade_link}
          </Link>{' '}
          {s.ad_banner.suffix}
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-on-surface-variant hover:text-on-surface transition-colors ml-4 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
