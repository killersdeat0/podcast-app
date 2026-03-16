'use client'

import { useEffect, useState } from 'react'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useUser } from '@/lib/auth/UserContext'

export default function GuestToast() {
  const strings = useStrings()
  const { isGuest } = useUser()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isGuest) return
    if (localStorage.getItem('guestToastShown')) return
    localStorage.setItem('guestToastShown', '1')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)
  }, [isGuest])

  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-4 z-50 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 shadow-xl max-w-xs flex items-start gap-3">
      <p className="text-sm text-gray-200 flex-1">
        {strings.guest.toast_message}{' '}
        <a href="/login" className="text-violet-400 hover:text-violet-300 font-medium">
          {strings.guest.toast_signin}
        </a>
      </p>
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
