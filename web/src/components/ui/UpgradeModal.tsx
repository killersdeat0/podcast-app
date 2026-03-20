'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
}

export default function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const strings = useStrings()

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-on-surface mb-2">
              {strings.queue.upgrade_modal_title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-on-surface-variant mb-6">
              {strings.queue.upgrade_modal_body}
            </Dialog.Description>
            <div className="flex flex-col gap-3">
              <a
                href="/upgrade"
                className="w-full bg-brand hover:bg-brand text-on-surface rounded-lg px-4 py-3 text-sm font-medium transition-colors text-center"
              >
                {strings.queue.upgrade_modal_cta}
              </a>
              <Dialog.Close asChild>
                <button className="text-sm text-on-surface-variant hover:text-on-surface transition-colors py-1">
                  {strings.queue.upgrade_modal_cancel}
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
