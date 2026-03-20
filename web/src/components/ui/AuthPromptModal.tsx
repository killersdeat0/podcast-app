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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-on-surface mb-2">
              {title ?? strings.guest.auth_prompt_title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-on-surface-variant mb-6">
              {body ?? strings.guest.auth_prompt_body}
            </Dialog.Description>
            <div className="flex flex-col gap-3">
              <a
                href={loginHref}
                className="w-full bg-brand hover:bg-brand text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center"
              >
                {strings.guest.auth_prompt_signin}
              </a>
              <a
                href={signupHref}
                className="w-full bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center"
              >
                {strings.guest.auth_prompt_signup}
              </a>
              {dismissable && (
                <Dialog.Close asChild>
                  <button className="text-sm text-on-surface-variant hover:text-on-surface transition-colors py-1">
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
