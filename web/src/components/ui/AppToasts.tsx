'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'
import WelcomeModal from '@/components/ui/WelcomeModal'

export default function AppToasts() {
  const strings = useStrings()
  const { isGuest } = useUser()
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [guestWelcomeOpen, setGuestWelcomeOpen] = useState(false)

  // New signed-in user welcome modal — flag set by AuthForm before navigation.
  // Runs on mount with empty deps to avoid timing issues with router.push/refresh.
  useEffect(() => {
    if (localStorage.getItem('pendingWelcomeModal')) {
      localStorage.removeItem('pendingWelcomeModal')
      if (!localStorage.getItem('welcomeModalShown')) {
        localStorage.setItem('welcomeModalShown', '1')
        setWelcomeOpen(true)
      }
      return
    }
    // Google OAuth from guest fallback: AuthForm sets pendingWelcomeModal before redirect,
    // but if that somehow didn't persist (e.g. tab crashed mid-redirect), this catches it.
    // Always clean up guestToastShown for logged-in users to prevent stale state.
    if (!isGuest && localStorage.getItem('guestToastShown')) {
      localStorage.removeItem('guestToastShown')
      if (!localStorage.getItem('welcomeModalShown')) {
        localStorage.setItem('welcomeModalShown', '1')
        setWelcomeOpen(true)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guest welcome modal — flag set by "Continue as guest" click in AuthForm.
  useEffect(() => {
    if (localStorage.getItem('pendingGuestWelcomeModal')) {
      localStorage.removeItem('pendingGuestWelcomeModal')
      setGuestWelcomeOpen(true)
    }
  }, [])

  // Returning-user welcome toast (not the modal)
  // Guards against Supabase firing SIGNED_IN on every tab-focus via _recoverAndRefresh().
  // sessionStorage ensures the toast fires at most once per page session (cleared on tab close).
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return
      const createdAt = new Date(session.user.created_at).getTime()
      const isNewUser = Date.now() - createdAt < 30_000
      if (isNewUser) return
      if (sessionStorage.getItem('welcomeToastShownThisSession')) return
      const lastShown = Number(localStorage.getItem('welcomeToastShownAt') ?? 0)
      if (Date.now() - lastShown < 12 * 60 * 60 * 1000) return
      sessionStorage.setItem('welcomeToastShownThisSession', '1')
      localStorage.setItem('welcomeToastShownAt', String(Date.now()))
      toast(strings.welcome_toast)
    })
    return () => subscription.unsubscribe()
  }, [strings])

  // Guest toast (shown once per guest session)
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

  return (
    <>
      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} variant="user" />
      <WelcomeModal open={guestWelcomeOpen} onClose={() => setGuestWelcomeOpen(false)} variant="guest" />
    </>
  )
}
