'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface StatsData {
  tier: 'free' | 'paid'
  dailyRows: { date: string; secondsListened: number }[]
  showRows: {
    feedUrl: string
    title: string | null
    secondsListened: number
    episodesCompleted: number
    lastListenedAt: string
  }[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDuration(seconds: number, unitMin: string, unitHr: string): { value: string; unit: string } {
  if (seconds < 60) return { value: '—', unit: '' }
  const hours = seconds / 3600
  if (hours < 1) return { value: `${Math.round(seconds / 60)}${unitMin}`, unit: '' }
  return { value: hours.toFixed(1), unit: unitHr }
}


/** Simple bar chart using plain divs. values is an array of { label, value }. */
function BarChart({ bars }: { bars: { label: string; value: number }[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1)
  return (
    <div className="flex items-end gap-1.5 h-24">
      {bars.map((bar, i) => {
        const pct = (bar.value / max) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex flex-col justify-end" style={{ height: '72px' }}>
              <div
                className="w-full rounded-t bg-primary transition-all"
                style={{ height: `${Math.max(pct, bar.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-[10px] text-on-surface-dim truncate w-full text-center">
              {bar.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null)
  const strings = useStrings()

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  // Aggregate dailyRows by day of week (0=Sun … 6=Sat)
  const byDow = Array(7).fill(0) as number[]
  if (data) {
    for (const row of data.dailyRows) {
      const dow = new Date(row.date + 'T00:00:00').getDay()
      byDow[dow] += row.secondsListened
    }
  }
  const dowBars = DAY_LABELS.map((label, i) => ({ label, value: byDow[i] }))

  // Aggregate dailyRows by month (YYYY-MM)
  const byMonth: Record<string, number> = {}
  if (data) {
    for (const row of data.dailyRows) {
      const month = row.date.slice(0, 7)
      byMonth[month] = (byMonth[month] ?? 0) + row.secondsListened
    }
  }
  const monthBars = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      label: new Date(month + '-01').toLocaleString('default', { month: 'short' }),
      value,
    }))

  const totalSeconds = data
    ? data.dailyRows.reduce((sum, r) => sum + r.secondsListened, 0)
    : 0

  const hasData = data && data.dailyRows.length > 0
  const totalDuration = formatDuration(totalSeconds, strings.stats.unit_min, strings.stats.unit_hr)

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-on-surface mb-8">{strings.stats.heading}</h1>

      {!data ? (
        <div className="space-y-4">
          <div className="h-6 bg-surface-container rounded animate-pulse w-48" />
          <div className="h-24 bg-surface-container rounded-xl animate-pulse" />
          <div className="h-24 bg-surface-container rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Hours listened ───────────────────────────────────────────── */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-2">
              {strings.stats.time_listened}
            </p>
            {hasData ? (
              <p className="text-4xl font-bold text-on-surface leading-none">
                {totalDuration.value}
                {totalDuration.unit && <span className="text-lg font-normal text-on-surface-variant ml-2">{totalDuration.unit}</span>}
              </p>
            ) : (
              <p className="text-sm text-on-surface-variant">{strings.stats.no_data}</p>
            )}
          </div>

          {/* ── By day of week ───────────────────────────────────────────── */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-4">
              {strings.stats.by_day_of_week}
            </p>
            <BarChart bars={dowBars} />
          </div>

          {/* ── Monthly trend ────────────────────────────────────────────── */}
          {monthBars.length > 0 && (
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-4">
                {strings.stats.monthly_trend}
              </p>
              <BarChart bars={monthBars} />
            </div>
          )}

          {/* ── Top shows ────────────────────────────────────────────────── */}
          {data.showRows.length > 0 && (
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-4">
                {strings.stats.top_shows}
              </p>
              <ul className="space-y-3">
                {data.showRows.map((show) => (
                  <li key={show.feedUrl} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-on-surface truncate min-w-0">
                      {show.title ?? show.feedUrl}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-medium text-on-surface">
                        {(() => { const { value, unit } = formatDuration(show.secondsListened, strings.stats.unit_min, strings.stats.unit_hr); return <>{value}{unit && <span className="text-xs font-normal text-on-surface-variant ml-1">{unit}</span>}</> })()}
                      </span>
                      <span className="text-xs text-on-surface-dim">
                        {show.episodesCompleted} {strings.stats.episodes_completed}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Free tier upsell ─────────────────────────────────────────── */}
          {data.tier === 'free' && (
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">{strings.stats.free_upsell}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {strings.stats.free_upsell_description}
                </p>
              </div>
              <Link
                href="/upgrade"
                className="flex-shrink-0 inline-flex items-center gap-1 bg-brand hover:bg-brand text-on-brand text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Sparkles size={14} />
                {strings.stats.upgrade_cta}
              </Link>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
