'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStrings } from '@/lib/i18n/LocaleContext'

type Mode = 'login' | 'signup'

function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return raw
}

function AuthFormInner({ mode }: { mode: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = sanitizeNext(searchParams.get('returnTo')) ?? '/discover'
  const supabase = createClient()
  const s = useStrings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data.session) {
        router.push('/verify-email?email=' + encodeURIComponent(email))
        return
      }

      localStorage.removeItem('guestQueue')
      localStorage.removeItem('guestToastShown')
      router.push(returnTo)
      router.refresh()
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      localStorage.removeItem('guestQueue')
      localStorage.removeItem('guestToastShown')
      router.push(returnTo)
      router.refresh()
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
    })
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
      <h1 className="text-2xl font-bold text-on-surface mb-1">
        {mode === 'login' ? s.auth.login_heading : s.auth.signup_heading}
      </h1>
      <p className="text-on-surface-variant text-sm mb-6">
        {mode === 'login' ? `${s.auth.no_account} ` : `${s.auth.have_account} `}
        <a
          href={mode === 'login' ? '/signup' : '/login'}
          className="text-primary hover:text-primary"
        >
          {mode === 'login' ? s.auth.sign_up_link : s.auth.log_in_link}
        </a>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={s.auth.email_placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="password"
          placeholder={s.auth.password_placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        {mode === 'login' && (
          <div className="flex justify-end -mt-2">
            <a href="/forgot-password" className="text-xs text-primary hover:opacity-80">
              {s.auth.forgot_password_link}
            </a>
          </div>
        )}
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors"
        >
          {loading ? s.auth.loading : mode === 'login' ? s.auth.login_button : s.auth.signup_button}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-outline-variant" />
        </div>
        <div className="relative flex justify-center text-xs text-on-surface-variant">
          <span className="bg-surface-container-low px-2">{s.auth.or_divider}</span>
        </div>
      </div>

      <button
        onClick={handleGoogle}
        className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {s.auth.google_button}
      </button>

      <p className="text-center text-sm text-on-surface-variant mt-4">
        <a href="/discover" className="text-primary hover:text-primary">
          {s.auth.guest_browse}
        </a>
      </p>
    </div>
  )
}

export default function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={null}>
      <AuthFormInner mode={mode} />
    </Suspense>
  )
}
