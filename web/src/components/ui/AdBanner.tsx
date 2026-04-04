'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useStrings } from '@/lib/i18n/LocaleContext'

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
const AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID

export default function AdBanner() {
  const [dismissed, setDismissed] = useState(false)
  const adRef = useRef<HTMLModElement>(null)
  const s = useStrings()

  useEffect(() => {
    if (!PUBLISHER_ID || !AD_SLOT || !adRef.current) return
    try {
      ;(window as any).adsbygoogle = (window as any).adsbygoogle || []
      ;(window as any).adsbygoogle.push({})
    } catch {}
  }, [])

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
          onClick={() => setDismissed(true)}
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
        onClick={() => setDismissed(true)}
        className="text-on-surface-variant hover:text-on-surface transition-colors ml-4 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
