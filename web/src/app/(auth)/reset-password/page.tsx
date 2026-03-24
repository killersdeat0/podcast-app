'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useStrings } from '@/lib/i18n/LocaleContext'

export default function ResetPasswordPage() {
  const s = useStrings()
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password !== confirm) {
      setError(s.auth.reset_mismatch)
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(s.auth.reset_error)
      setLoading(false)
      return
    }

    setLoading(false)
    setSuccess(true)
    setTimeout(() => {
      router.push('/discover')
    }, 1500)
  }

  if (success) {
    return (
      <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-on-surface mb-4">{s.auth.reset_heading}</h1>
        <p className="text-on-surface-variant text-sm">{s.auth.reset_success}</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
      <h1 className="text-2xl font-bold text-on-surface mb-1">{s.auth.reset_heading}</h1>
      <p className="text-on-surface-variant text-sm mb-6">{s.auth.reset_description}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          placeholder={s.auth.reset_password_placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="password"
          placeholder={s.auth.reset_confirm_placeholder}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full bg-surface-container text-on-surface rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors"
        >
          {s.auth.reset_submit}
        </button>
      </form>
    </div>
  )
}
