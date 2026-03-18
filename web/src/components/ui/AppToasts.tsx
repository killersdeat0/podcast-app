'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'

export default function AppToasts() {
  const strings = useStrings()
  const { isGuest } = useUser()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return
      const createdAt = new Date(session.user.created_at).getTime()
      const isNewUser = Date.now() - createdAt < 30_000
      if (isNewUser) {
        toast(strings.welcome_toast_new_user)
        return
      }
      const lastShown = Number(localStorage.getItem('welcomeToastShownAt') ?? 0)
      if (Date.now() - lastShown < 12 * 60 * 60 * 1000) return
      localStorage.setItem('welcomeToastShownAt', String(Date.now()))
      toast(strings.welcome_toast)
    })
    return () => subscription.unsubscribe()
  }, [strings])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!isGuest) return
    if (localStorage.getItem('guestToastShown')) return
    localStorage.setItem('guestToastShown', '1')
    toast(strings.guest.toast_message, {
      action: {
        label: strings.guest.toast_signin,
        onClick: () => { window.location.href = '/login' },
      },
      duration: Infinity,
    })
  }, [isGuest, strings])

  return null
}
