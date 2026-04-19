'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { useStrings, useLocale, LOCALE_LABELS } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import { useTheme, THEMES, type Theme } from '@/lib/theme/useTheme'

const THEME_META: Record<Theme, { label: string; color: string }> = {
  rose:   { label: 'Rose',   color: '#f43f5e' },
  amber:  { label: 'Amber',  color: '#f59e0b' },
  sky:    { label: 'Sky',    color: '#0ea5e9' },
  violet: { label: 'Violet', color: '#7c3aed' },
}
import { usePlayer } from '@/components/player/PlayerContext'
import { useSignOut } from '@/lib/auth/useSignOut'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/lib/i18n'
import Link from 'next/link'
import AboutModal from '@/components/ui/AboutModal'

const ALL_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const FREE_SPEEDS = [1, 2]
const SKIP_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90]

export default function SettingsPage() {
  const s = useStrings()
  const { locale, setLocale } = useLocale()
  const { isGuest, tier } = useUser()
  const { theme, changeTheme } = useTheme(isGuest)
  const { setSpeed } = usePlayer()
  const { signOut } = useSignOut()

  const isFreeTier = tier === 'free'
  const availableSpeeds = isFreeTier ? FREE_SPEEDS : ALL_SPEEDS

  // Playback defaults — read from same localStorage keys that Player.tsx uses
  const [defaultSpeed, setDefaultSpeed] = useState(1)
  const [defaultVolume, setDefaultVolume] = useState(1)
  const [skipBack, setSkipBack] = useState(15)
  const [skipForward, setSkipForward] = useState(30)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    // Restore from localStorage immediately (fast path)
    const storedSpeed = localStorage.getItem('playback-speed')
    if (storedSpeed) {
      const parsed = Number(storedSpeed)
      if (!isNaN(parsed)) setDefaultSpeed(parsed)
    }
    const storedVolume = localStorage.getItem('playback-volume')
    if (storedVolume) {
      const parsed = Number(storedVolume)
      if (!isNaN(parsed)) setDefaultVolume(parsed)
    }
    const storedSkipBack = localStorage.getItem('skip-back-seconds')
    if (storedSkipBack) setSkipBack(Number(storedSkipBack))
    const storedSkipFwd = localStorage.getItem('skip-forward-seconds')
    if (storedSkipFwd) setSkipForward(Number(storedSkipFwd))

    if (!isGuest) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) setUserEmail(user.email)
      })
      // Sync from DB — overwrites localStorage so cross-device changes are applied
      fetch('/api/profile')
        .then((r) => r.json())
        .then((data: { defaultVolume: number | null; skipBackSeconds: number | null; skipForwardSeconds: number | null }) => {
          if (data.defaultVolume != null) {
            setDefaultVolume(data.defaultVolume)
            localStorage.setItem('playback-volume', String(data.defaultVolume))
          }
          if (data.skipBackSeconds != null) {
            setSkipBack(data.skipBackSeconds)
            localStorage.setItem('skip-back-seconds', String(data.skipBackSeconds))
          }
          if (data.skipForwardSeconds != null) {
            setSkipForward(data.skipForwardSeconds)
            localStorage.setItem('skip-forward-seconds', String(data.skipForwardSeconds))
          }
        })
        .catch(() => {})
    }
  }, [isGuest])

  function handleSpeedChange(speed: number) {
    setDefaultSpeed(speed)
    if (!isFreeTier) {
      localStorage.setItem('playback-speed', String(speed))
      setSpeed(speed)
    }
  }

  function handleSkipBackChange(seconds: number) {
    setSkipBack(seconds)
    localStorage.setItem('skip-back-seconds', String(seconds))
    window.dispatchEvent(new Event('skip-intervals-changed'))
    if (!isGuest) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipBackSeconds: seconds }),
      }).catch(() => {})
    }
  }

  function handleSkipForwardChange(seconds: number) {
    setSkipForward(seconds)
    localStorage.setItem('skip-forward-seconds', String(seconds))
    window.dispatchEvent(new Event('skip-intervals-changed'))
    if (!isGuest) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipForwardSeconds: seconds }),
      }).catch(() => {})
    }
  }

  function handleVolumeChange(volume: number) {
    setDefaultVolume(volume)
    localStorage.setItem('playback-volume', String(volume))
    window.dispatchEvent(new CustomEvent('volume-changed', { detail: { volume } }))
    if (!isGuest) {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultVolume: volume }),
      }).catch(() => {})
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (res.ok) {
        await signOut()
      } else {
        const body = await res.json().catch(() => ({}))
        setDeleteOpen(false)
        if (body.error === 'stripe_cancel_failed') {
          toast.error(s.settings.delete_error_stripe, { duration: Infinity })
        } else {
          toast.error(s.settings.delete_error_generic, { duration: Infinity })
        }
      }
    } catch {
      setDeleteOpen(false)
      toast.info('To delete your account, contact support at support@syncpods.app')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-on-surface mb-8">{s.settings.heading}</h1>

      <div className="space-y-6">

        {/* ─── Appearance ─────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-on-surface-dim uppercase tracking-wider mb-3">
            Appearance
          </h2>
          <div className="bg-surface-container rounded-xl overflow-hidden divide-y divide-outline-variant">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-on-surface">Theme</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Choose your accent color</p>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => changeTheme(t)}
                    title={THEME_META[t].label}
                    aria-label={`${THEME_META[t].label} theme${theme === t ? ' (active)' : ''}`}
                    className="w-6 h-6 rounded-full transition-all"
                    style={{
                      background: THEME_META[t].color,
                      outline: theme === t ? `2px solid white` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Mini preview strip */}
            <div className="px-4 py-2.5 flex items-center gap-3 bg-surface-container-low">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-on-brand text-xs flex-shrink-0"
                style={{ background: THEME_META[theme].color }}
              >
                ▶
              </div>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-1.5 rounded-full w-2/5 transition-colors"
                    style={{ background: THEME_META[theme].color }}
                  />
                </div>
              </div>
              <span className="text-xs text-on-surface-variant">{THEME_META[theme].label}</span>
            </div>
          </div>
        </section>

        {/* ── Playback Defaults ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-semibold text-on-surface-dim uppercase tracking-wider">
              {s.settings.playback_section}
            </h2>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl divide-y divide-outline-variant">
            {/* Default speed */}
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-on-surface">{s.settings.default_speed}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{s.settings.playback_hint}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <select
                  value={availableSpeeds.includes(defaultSpeed) ? defaultSpeed : availableSpeeds[availableSpeeds.length - 1]}
                  onChange={(e) => handleSpeedChange(Number(e.target.value))}
                  disabled={isFreeTier}
                  className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {availableSpeeds.map((s) => (
                    <option key={s} value={s}>{s}x</option>
                  ))}
                </select>
                {isFreeTier && (
                  <Link href="/upgrade" className="text-[10px] text-primary hover:underline whitespace-nowrap">
                    {s.settings.free_speed_hint}
                  </Link>
                )}
              </div>
            </div>

            {/* Default volume */}
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-on-surface flex-shrink-0">{s.settings.default_volume}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-on-surface-variant w-10 text-right">
                  {Math.round(defaultVolume * 100)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={defaultVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-28 accent-brand"
                  aria-label={s.settings.default_volume}
                />
              </div>
            </div>

            {/* Skip back interval */}
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-on-surface flex-shrink-0">{s.settings.skip_back}</p>
              <select
                value={skipBack}
                onChange={(e) => handleSkipBackChange(Number(e.target.value))}
                className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary"
              >
                {SKIP_OPTIONS.map((n) => (
                  <option key={n} value={n}>{s.settings.skip_seconds(n)}</option>
                ))}
              </select>
            </div>

            {/* Skip forward interval */}
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <p className="text-sm text-on-surface flex-shrink-0">{s.settings.skip_forward}</p>
              <select
                value={skipForward}
                onChange={(e) => handleSkipForwardChange(Number(e.target.value))}
                className="bg-surface-container text-on-surface text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary"
              >
                {SKIP_OPTIONS.map((n) => (
                  <option key={n} value={n}>{s.settings.skip_seconds(n)}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Language ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-semibold text-on-surface-dim uppercase tracking-wider">
              {s.settings.language_section}
            </h2>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-on-surface">{s.profile.language}</p>
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
        </section>

        {/* ── Account ───────────────────────────────────────────────────── */}
        {!isGuest && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs font-semibold text-on-surface-dim uppercase tracking-wider">
                {s.settings.account_section}
              </h2>
              <div className="flex-1 h-px bg-outline-variant" />
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded-xl divide-y divide-outline-variant">
              {/* Email (read-only) */}
              {userEmail && (
                <div className="px-6 py-4">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{s.profile.account}</p>
                  <p className="text-sm text-on-surface">{userEmail}</p>
                </div>
              )}

              {/* Sign out */}
              <div className="px-6 py-4">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-sm text-on-surface hover:text-error transition-colors disabled:opacity-50"
                >
                  {signingOut ? '…' : s.settings.sign_out}
                </button>
              </div>

              {/* Delete account */}
              <div className="px-6 py-4">
                <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <Dialog.Trigger asChild>
                    <button className="text-sm text-error hover:underline transition-colors">
                      {s.settings.delete_account}
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-scrim z-50" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-surface-container border border-outline-variant rounded-2xl p-6 shadow-xl focus:outline-none">
                      <Dialog.Title className="text-lg font-semibold text-on-surface mb-2">
                        {s.settings.delete_confirm_heading}
                      </Dialog.Title>
                      <Dialog.Description className="text-sm text-on-surface-variant mb-6">
                        {s.settings.delete_confirm_body}
                      </Dialog.Description>
                      <div className="flex gap-3 justify-end">
                        <Dialog.Close asChild>
                          <button className="px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-lg border border-outline-variant">
                            {s.settings.delete_cancel}
                          </button>
                        </Dialog.Close>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="px-4 py-2 text-sm font-medium bg-error text-on-error rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {deleting ? '…' : s.settings.delete_confirm_button}
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="mt-10 flex items-center gap-4">
        <button
          onClick={() => setAboutOpen(true)}
          className="text-xs text-on-surface-dim hover:text-on-surface-variant transition-colors"
        >
          {s.settings.about}
        </button>
        <span className="text-on-surface-dim text-xs">·</span>
        <Link href="/contact" className="text-xs text-on-surface-dim hover:text-on-surface-variant transition-colors">
          {s.settings.contact}
        </Link>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
