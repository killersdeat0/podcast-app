'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

export default function ForgotPasswordPage() {
  const s = useStrings()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-on-surface mb-4">{s.auth.forgot_heading}</h1>
        <p className="text-on-surface-variant text-sm">{s.auth.forgot_success}</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
      <h1 className="text-2xl font-bold text-on-surface mb-1">{s.auth.forgot_heading}</h1>
      <p className="text-on-surface-variant text-sm mb-6">{s.auth.forgot_description}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={s.auth.forgot_email_placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors"
        >
          {s.auth.forgot_submit}
        </button>
      </form>

      <p className="text-center text-sm mt-4">
        <a href="/login" className="text-primary hover:text-primary">
          {s.auth.forgot_back_to_login}
        </a>
      </p>
    </div>
  )
}
