'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ProfileData {
  email: string
  tier: 'free' | 'paid'
  listeningSeconds: number
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} min`
  return `${hours.toFixed(1)} hr`
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-white mb-8">Profile</h1>

      {!data ? (
        <div className="space-y-4">
          <div className="h-6 bg-gray-800 rounded animate-pulse w-48" />
          <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">{data.email}</p>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Account</p>
              <p className="text-white font-semibold text-lg capitalize">{data.tier}</p>
            </div>
            {data.tier === 'free' && (
              <Link
                href="/upgrade"
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Upgrade
              </Link>
            )}
            {data.tier === 'paid' && (
              <span className="text-violet-400 text-sm font-medium">Pro</span>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Listened (last 30 days)</p>
            <p className="text-white font-semibold text-3xl">{formatHours(data.listeningSeconds)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
