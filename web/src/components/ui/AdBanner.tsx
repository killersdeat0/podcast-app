'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useStrings } from '@/lib/i18n/LocaleContext'

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
const AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID

const DISMISS_KEY = 'ad-banner-dismissed-until'
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export default function AdBanner() {
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash
  const adRef = useRef<HTMLModElement>(null)
  const s = useStrings()

  useEffect(() => {
    const until = localStorage.getItem(DISMISS_KEY)
    if (!until || Date.now() > Number(until)) setDismissed(false)
  }, [])

  useEffect(() => {
    if (!PUBLISHER_ID || !AD_SLOT || !adRef.current) return
    try {
      const w = window as Window & { adsbygoogle?: unknown[] }
      w.adsbygoogle = w.adsbygoogle || []
      w.adsbygoogle.push({})
    } catch {}
  }, [dismissed])

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS))
    setDismissed(true)
  }

  if (dismissed) return null

  if (PUBLISHER_ID && AD_SLOT) {
    return (
      <div className="relative bg-surface-container border-b border-outline-variant w-full overflow-hidden">
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={PUBLISHER_ID}
          data-ad-slot={AD_SLOT}
          data-ad-format="horizontal"
          data-full-width-responsive="true"
        />
        <button
          onClick={handleDismiss}
          className="absolute top-1 right-2 text-on-surface-variant hover:text-on-surface transition-colors text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  // Fallback: house upgrade CTA
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
        onClick={handleDismiss}
        className="text-on-surface-variant hover:text-on-surface transition-colors ml-4 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
