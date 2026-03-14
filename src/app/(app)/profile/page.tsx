'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings, useLocale, LOCALE_LABELS } from '@/lib/i18n/LocaleContext'
import type { Locale } from '@/lib/i18n'

interface ProfileData {
  email: string
  tier: 'free' | 'paid'
  listeningSeconds: number
  completedThisWeek: number
  streakDays: number
}

interface Subscription {
  feed_url: string
  title: string
  artwork_url: string | null
  collection_id: string | null
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} min`
  return `${hours.toFixed(1)} hr`
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [downgrading, setDowngrading] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [importedCount, setImportedCount] = useState(0)
  const strings = useStrings()
  const { locale, setLocale } = useLocale()

  function fetchProfile() {
    fetch('/api/profile')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }

  useEffect(() => {
    fetchProfile()
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((subs) => { if (Array.isArray(subs)) setSubscriptions(subs) })
      .catch(() => {})
  }, [])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportStatus('loading')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/opml/import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setImportedCount(json.imported)
      setImportStatus('success')
      setSubscriptions([])
      fetch('/api/subscriptions')
        .then((r) => r.json())
        .then((subs) => { if (Array.isArray(subs)) setSubscriptions(subs) })
        .catch(() => {})
      window.dispatchEvent(new Event('subscriptions-changed'))
    } catch {
      setImportStatus('error')
    }
  }

  async function handleDowngrade() {
    setDowngrading(true)
    await fetch('/api/dev/downgrade', { method: 'POST' })
    fetchProfile()
    setDowngrading(false)
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-white mb-8">{strings.profile.heading}</h1>

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
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{strings.profile.account}</p>
              <p className="text-white font-semibold text-lg capitalize">{data.tier}</p>
            </div>
            {data.tier === 'free' && (
              <Link
                href="/upgrade"
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {strings.profile.upgrade_cta}
              </Link>
            )}
            {data.tier === 'paid' && (
              <div className="flex flex-col items-end">
                <span className="text-violet-400 text-sm font-medium">{strings.profile.pro_label}</span>
                {process.env.NODE_ENV === 'development' && (
                  <button onClick={handleDowngrade} disabled={downgrading}
                    className="mt-2 text-xs text-red-400 underline">
                    {strings.profile.dev_downgrade}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{strings.profile.listened}</p>
            <p className="text-white font-semibold text-3xl">{formatHours(data.listeningSeconds)}</p>
          </div>

          {data.tier === 'paid' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{strings.profile.completed_this_week}</p>
                <p className="text-white font-semibold text-3xl">{data.completedThisWeek}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{strings.profile.streak}</p>
                <p className="text-white font-semibold text-3xl">{data.streakDays}</p>
              </div>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{strings.profile.language}</p>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-500"
            >
              {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {strings.profile.subscriptions} ({subscriptions.length})
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="/api/opml/export"
                  download="subscriptions.opml"
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {strings.profile.opml_export}
                </a>
                <span className="text-gray-700">|</span>
                <label className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer">
                  {importStatus === 'loading' ? strings.profile.opml_importing : strings.profile.opml_import}
                  <input
                    type="file"
                    accept=".opml,.xml"
                    className="sr-only"
                    onChange={handleImport}
                    disabled={importStatus === 'loading'}
                  />
                </label>
              </div>
            </div>
            {importStatus === 'success' && (
              <p className="text-xs text-green-400 mb-2">
                {strings.profile.opml_import_success.replace('{{n}}', String(importedCount))}
              </p>
            )}
            {importStatus === 'error' && (
              <p className="text-xs text-red-400 mb-2">{strings.profile.opml_import_error}</p>
            )}
            {subscriptions.length === 0 ? (
              <EmptyState
                title={strings.profile.subscriptions_empty}
                description={strings.profile.subscriptions_empty_description}
                cta={{ label: strings.profile.subscriptions_empty_cta, href: '/discover' }}
              />
            ) : (
              <ul className="mt-3 space-y-3">
                {subscriptions.map((sub) => (
                  <li key={sub.feed_url}>
                    <Link
                      href={`/podcast/${sub.collection_id ?? encodeURIComponent(sub.feed_url)}?feed=${encodeURIComponent(sub.feed_url)}&title=${encodeURIComponent(sub.title)}&artwork=${encodeURIComponent(sub.artwork_url ?? '')}`}
                      className="flex items-center gap-3 group"
                    >
                      {sub.artwork_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sub.artwork_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-300 group-hover:text-white truncate transition-colors">
                        {sub.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
