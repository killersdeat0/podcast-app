'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  new_episode_count: number
  episode_filter: string | null
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} min`
  return `${hours.toFixed(1)} hr`
}

export default function ProfilePage() {
  const router = useRouter()
  const [data, setData] = useState<ProfileData | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [downgrading, setDowngrading] = useState(false)
  const [resettingLastVisited, setResettingLastVisited] = useState(false)
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
    router.refresh()
  }

  async function handleResetLastVisited() {
    setResettingLastVisited(true)
    await fetch('/api/dev/reset-last-visited', { method: 'POST' })
    // Clear client-side gate so the refresh fires immediately
    localStorage.removeItem('feed_refresh_last_called')
    // Recompute new_episode_count for all subscriptions
    const res = await fetch('/api/subscriptions/refresh', { method: 'POST' })
    if (res.ok) {
      const { subscriptions } = await res.json()
      setSubscriptions(subscriptions)
    }
    window.dispatchEvent(new Event('subscriptions-changed'))
    setResettingLastVisited(false)
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-on-surface mb-8">{strings.profile.heading}</h1>

      {!data ? (
        <div className="space-y-4">
          <div className="h-6 bg-surface-container rounded animate-pulse w-48" />
          <div className="h-24 bg-surface-container rounded-xl animate-pulse" />
          <div className="h-24 bg-surface-container rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-on-surface-variant text-sm">{data.email}</p>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{strings.profile.account}</p>
              <p className="text-on-surface font-semibold text-lg capitalize">{data.tier}</p>
            </div>
            {data.tier === 'free' && (
              <div className="flex flex-col items-end gap-2">
                <Link
                  href="/upgrade"
                  className="bg-brand hover:bg-brand text-on-brand text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {strings.profile.upgrade_cta}
                </Link>
                {process.env.NODE_ENV === 'development' && (
                  <button onClick={handleResetLastVisited} disabled={resettingLastVisited}
                    className="text-xs text-warning underline">
                    {resettingLastVisited ? 'Resetting…' : 'DEV: Reset last seen → 7 days ago'}
                  </button>
                )}
              </div>
            )}
            {data.tier === 'paid' && (
              <div className="flex flex-col items-end">
                <span className="text-primary text-sm font-medium">{strings.profile.pro_label}</span>
                {process.env.NODE_ENV === 'development' && (
                  <div className="flex flex-col items-end gap-1 mt-2">
                    <button onClick={handleDowngrade} disabled={downgrading}
                      className="text-xs text-error underline">
                      {strings.profile.dev_downgrade}
                    </button>
                    <button onClick={handleResetLastVisited} disabled={resettingLastVisited}
                      className="text-xs text-warning underline">
                      {resettingLastVisited ? 'Resetting…' : 'DEV: Reset last seen → 7 days ago'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{strings.profile.listened}</p>
            <p className="text-on-surface font-semibold text-3xl">{formatHours(data.listeningSeconds)}</p>
          </div>

          {data.tier === 'paid' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{strings.profile.completed_this_week}</p>
                <p className="text-on-surface font-semibold text-3xl">{data.completedThisWeek}</p>
              </div>
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{strings.profile.streak}</p>
                <p className="text-on-surface font-semibold text-3xl">{data.streakDays}</p>
              </div>
            </div>
          )}

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-center justify-between">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider">{strings.profile.language}</p>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary"
            >
              {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider">
                {strings.profile.subscriptions} ({subscriptions.length})
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="/api/opml/export"
                  download="subscriptions.opml"
                  className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {strings.profile.opml_export}
                </a>
                <span className="text-on-surface-variant">|</span>
                <label className="text-xs text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
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
              <p className="text-xs text-playback-indicator mb-2">
                {strings.profile.opml_import_success.replace('{{n}}', String(importedCount))}
              </p>
            )}
            {importStatus === 'error' && (
              <p className="text-xs text-error mb-2">{strings.profile.opml_import_error}</p>
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
                      href={`/podcast/${sub.collection_id ?? encodeURIComponent(sub.feed_url)}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="relative w-10 h-10 flex-shrink-0">
                        {sub.artwork_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sub.artwork_url}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface-container" />
                        )}
                        {sub.new_episode_count > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-brand rounded-full border-2 border-surface flex items-center justify-center text-[10px] font-bold text-on-brand leading-none">
                            {sub.new_episode_count > 99 ? '99+' : sub.new_episode_count}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm text-on-surface group-hover:text-on-surface truncate transition-colors block">
                          {sub.title}
                        </span>
                        {sub.episode_filter === '*' && (
                          <span className="text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            📻 All episodes
                          </span>
                        )}
                        {sub.episode_filter && sub.episode_filter !== '*' && (
                          <span className="text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-0.5 inline-block truncate max-w-full">
                            🎯 {sub.episode_filter}
                          </span>
                        )}
                      </div>
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
