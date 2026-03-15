'use client'

import { useStrings } from '@/lib/i18n/LocaleContext'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface AuthPromptModalProps {
  open: boolean
  onClose: () => void
  returnTo?: string
  title?: string
}

export default function AuthPromptModal({ open, onClose, returnTo, title }: AuthPromptModalProps) {
  const strings = useStrings()
  useEscapeKey(onClose, open)

  if (!open) return null

  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'
  const signupHref = returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-2">{title ?? strings.guest.auth_prompt_title}</h2>
        <p className="text-sm text-gray-400 mb-6">{strings.guest.auth_prompt_body}</p>
        <div className="flex flex-col gap-3">
          <a
            href={loginHref}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center"
          >
            {strings.guest.auth_prompt_signin}
          </a>
          <a
            href={signupHref}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center"
          >
            {strings.guest.auth_prompt_signup}
          </a>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-1"
          >
            {strings.guest.auth_prompt_cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
