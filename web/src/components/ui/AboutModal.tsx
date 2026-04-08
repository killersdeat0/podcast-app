'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useStrings } from '@/lib/i18n/LocaleContext'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  const strings = useStrings()
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <Dialog.Title className="text-xl font-bold text-on-surface">
                {strings.about.title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container -mt-1 -mr-1">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <div className="text-sm text-on-surface-variant space-y-3">
                <p>{strings.about.body_1}</p>
                <p>{strings.about.body_2}</p>
                <p>{strings.about.body_3}</p>
              </div>
            </Dialog.Description>
            <div className="mt-6 pt-4 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-dim">
              <span>syncpods.app</span>
              <a href="/contact" className="text-primary hover:underline transition-colors">
                {strings.about.contact_link}
              </a>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
