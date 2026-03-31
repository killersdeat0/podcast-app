'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Headphones, CheckCircle, Flame, Radio, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { formatDuration } from '@/lib/formatDuration'

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


/** Circular SVG ring around an icon. pct is 0–100. */
function CircularRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const size = 48
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--md-surface-container-high)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--md-playback-indicator)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>
      <div className="relative z-10 flex items-center justify-center text-playback-indicator">
        {children}
      </div>
    </div>
  )
}

/** 7 dots showing which days in the last 7 are within the current streak. */
function StreakDots({ streakDays }: { streakDays: number }) {
  // dot i=0 is day 1 of streak, fills left to right
  const dots = Array.from({ length: 7 }, (_, i) => i < streakDays)

  return (
    <div className="flex gap-1.5 mt-2">
      {dots.map((active, i) => (
        <span
          key={i}
          className={`w-3 h-3 rounded-full ${active ? 'bg-playback-indicator' : 'bg-surface-container-high'}`}
        />
      ))}
    </div>
  )
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

          {/* ── Account card ─────────────────────────────────────────────── */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{strings.profile.account}</p>
              <p className="text-on-surface text-sm">{data.email}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Tier badge */}
              {data.tier === 'paid' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-container text-on-primary-container">
                  <Sparkles size={12} />
                  {strings.profile.pro_label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-container text-on-surface-variant border border-outline-variant">
                  {strings.profile.free_label}
                </span>
              )}

              {data.tier === 'free' && (
                <Link
                  href="/upgrade"
                  className="bg-brand hover:bg-brand text-on-brand text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {strings.profile.upgrade_cta}
                </Link>
              )}
            </div>
          </div>

          {/* Dev tools */}
          {process.env.NODE_ENV === 'development' && (
            <div className="flex flex-col items-end gap-1">
              {data.tier === 'paid' && (
                <button onClick={handleDowngrade} disabled={downgrading}
                  className="text-xs text-error underline">
                  {strings.profile.dev_downgrade}
                </button>
              )}
              <button onClick={handleResetLastVisited} disabled={resettingLastVisited}
                className="text-xs text-warning underline">
                {resettingLastVisited ? 'Resetting…' : 'DEV: Reset last seen → 7 days ago'}
              </button>
            </div>
          )}

          {/* ── Stats grid ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">

            {/* Hours listened — with circular ring */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4 flex items-center gap-3">
              <CircularRing pct={Math.min(100, (data.listeningSeconds / 3600 / 100) * 100)}>
                <Headphones size={18} />
              </CircularRing>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-on-surface leading-none">
                  {(() => { const { value, unit } = formatDuration(data.listeningSeconds, strings.stats.unit_min, strings.stats.unit_hr); return <>{value}{unit && <span className="text-sm font-normal text-on-surface-variant ml-1">{unit}</span>}</> })()}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">{strings.profile.listened}</p>
                <p className="text-xs text-on-surface-dim">{strings.profile.listened_period}</p>
              </div>
            </div>

            {/* Subscriptions count */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-4 flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 flex-shrink-0 text-primary">
                <Radio size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-on-surface leading-none">{subscriptions.length}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{strings.profile.subscriptions_stat}</p>
              </div>
            </div>

            {/* Completed + Streak — single full-width row for paid users */}
            {data.tier === 'paid' && (
              <div className="col-span-2 bg-surface-container-low border border-outline-variant rounded-2xl p-4 flex items-center gap-6">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 flex-shrink-0 text-playback-indicator">
                    <CheckCircle size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-on-surface leading-none">{data.completedThisWeek}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{strings.profile.completed_this_week}</p>
                    <p className="text-xs text-on-surface-dim">{strings.profile.completed_period}</p>
                  </div>
                </div>
                <div className="w-px self-stretch bg-outline-variant" />
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 flex-shrink-0 text-warning">
                    <Flame size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-on-surface leading-none">{data.streakDays}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{strings.profile.streak}</p>
                    {data.streakDays > 0 && (
                      <>
                        <StreakDots streakDays={Math.min(7, data.streakDays)} />
                        <p className="text-xs text-on-surface-dim mt-0.5">{strings.profile.streak_week_label}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Stats sneak peek ─────────────────────────────────────────── */}
          <Link
            href="/stats"
            className="block bg-surface-container-low border border-outline-variant rounded-xl p-5 hover:border-primary/40 transition-colors group"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider">{strings.profile.stats_section}</p>
              <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">{strings.stats.view_stats}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Headphones size={13} className="text-on-surface-dim flex-shrink-0" />
                <span className="text-sm font-medium text-on-surface">
                  {(() => { const { value, unit } = formatDuration(data.listeningSeconds, strings.stats.unit_min, strings.stats.unit_hr); return <>{value}{unit && <span className="text-xs font-normal text-on-surface-variant ml-0.5">{unit}</span>}</> })()}
                </span>
                <span className="text-xs text-on-surface-dim">{strings.profile.listened_period}</span>
              </div>
              {data.streakDays > 0 && (
                <>
                  <span className="text-outline-variant">·</span>
                  <div className="flex items-center gap-1.5">
                    <Flame size={13} className="text-warning flex-shrink-0" />
                    <span className="text-sm font-medium text-on-surface">{data.streakDays}</span>
                    <span className="text-xs text-on-surface-dim">{strings.profile.streak}</span>
                  </div>
                </>
              )}
            </div>
          </Link>

          {/* ── Settings link ────────────────────────────────────────────── */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-center justify-between">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider">{strings.nav.settings}</p>
            <Link
              href="/settings"
              className="text-sm text-primary hover:underline transition-colors"
            >
              {strings.settings.settings_link}
            </Link>
          </div>

          {/* ── Subscriptions list ───────────────────────────────────────── */}
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
