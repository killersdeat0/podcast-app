'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

function VerifyEmailContent() {
  const s = useStrings()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  async function handleResend() {
    setResending(true)
    setResendError(null)

    const { error } = await supabase.auth.resend({ email, type: 'signup' })

    if (error) {
      setResendError(s.auth.verify_resend_error)
      setResending(false)
      return
    }

    setResending(false)
    setResent(true)
  }

  return (
    <div className="bg-surface-container-low rounded-2xl p-8 shadow-xl">
      <h1 className="text-2xl font-bold text-on-surface mb-1">{s.auth.verify_heading}</h1>
      <p className="text-on-surface-variant text-sm mb-2">
        {s.auth.verify_description}{' '}
        <span className="font-medium text-on-surface">{email}</span>
      </p>
      <p className="text-on-surface-variant text-sm mb-6">{s.auth.verify_spam_hint}</p>

      {resent ? (
        <p className="text-sm text-on-surface-variant mb-4">{s.auth.verify_resent}</p>
      ) : (
        <>
          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full bg-brand hover:bg-brand disabled:opacity-50 text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors mb-2"
          >
            {resending ? s.auth.verify_resending : s.auth.verify_resend}
          </button>
          {resendError && <p className="text-error text-sm mb-2">{resendError}</p>}
        </>
      )}

      <p className="text-center text-sm mt-2">
        <a href="/login" className="text-primary hover:text-primary">
          {s.auth.verify_back_to_login}
        </a>
      </p>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="bg-surface-container-low rounded-2xl p-8 shadow-xl" />}>
      <VerifyEmailContent />
    </Suspense>
  )
}
