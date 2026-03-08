'use client'

import { useState } from 'react'

export default function AdBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="flex items-center justify-between bg-gray-800 border-b border-gray-700 px-6 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ad</span>
        <span className="text-gray-300">Enjoying PodSync? Upgrade to Pro for an ad-free experience.</span>
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
