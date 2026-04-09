'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePlayer } from '@/components/player/PlayerContext'

const USER_SCOPED_CACHE_KEYS = [
  'for-you-cache',
  'guestToastShown',
  'welcomeToastShownAt',
]

export function useSignOut() {
  const router = useRouter()
  const { clearNowPlaying, clearClientQueue } = usePlayer()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearNowPlaying()
    clearClientQueue()
    for (const key of USER_SCOPED_CACHE_KEYS) {
      localStorage.removeItem(key)
    }
    router.push('/login')
    router.refresh()
  }

  return { signOut }
}
