'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface AuthPromptModalProps {
  open: boolean
  onClose: () => void
  returnTo?: string
  title?: string
  body?: string
  dismissable?: boolean
}

export default function AuthPromptModal({ open, onClose, returnTo, title, body, dismissable = true }: AuthPromptModalProps) {
  const strings = useStrings()
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'
  const signupHref = returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o && dismissable) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-white mb-2">
              {title ?? strings.guest.auth_prompt_title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-gray-400 mb-6">
              {body ?? strings.guest.auth_prompt_body}
            </Dialog.Description>
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
              {dismissable && (
                <Dialog.Close asChild>
                  <button className="text-sm text-gray-500 hover:text-gray-300 transition-colors py-1">
                    {strings.guest.auth_prompt_cancel}
                  </button>
                </Dialog.Close>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
