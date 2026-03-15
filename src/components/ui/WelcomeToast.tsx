'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

export default function WelcomeToast() {
  const strings = useStrings()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return
      const createdAt = new Date(session.user.created_at).getTime()
      const isNewUser = Date.now() - createdAt < 30_000
      if (isNewUser) return
      const lastShown = Number(localStorage.getItem('welcomeToastShownAt') ?? 0)
      if (Date.now() - lastShown < 12 * 60 * 60 * 1000) return
      localStorage.setItem('welcomeToastShownAt', String(Date.now()))
      setVisible(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-4 z-50 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 shadow-xl max-w-xs flex items-start gap-3">
      <p className="text-sm text-gray-200 flex-1">{strings.welcome_toast}</p>
      <button
        onClick={() => setVisible(false)}
        className="text-gray-500 hover:text-gray-300 flex-shrink-0 leading-none mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
