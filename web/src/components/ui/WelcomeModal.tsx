'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { RefreshCw, Rss, ListMusic, Bell } from 'lucide-react'
import { useStrings } from '@/lib/i18n/LocaleContext'
import { useRouter } from 'next/navigation'

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
  variant?: 'user' | 'guest'
}

const features = [
  { icon: <RefreshCw className="w-4 h-4" />, key: 'feature_sync' as const },
  { icon: <Rss className="w-4 h-4" />,       key: 'feature_rss' as const },
  { icon: <ListMusic className="w-4 h-4" />, key: 'feature_organize' as const },
  { icon: <Bell className="w-4 h-4" />,      key: 'feature_notifications' as const },
]

export default function WelcomeModal({ open, onClose, variant = 'user' }: WelcomeModalProps) {
  const strings = useStrings()
  const router = useRouter()
  const isGuest = variant === 'guest'

  function handleCta() {
    onClose()
    router.push(isGuest ? '/signup' : '/discover')
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-4 focus:outline-none">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-xl">

            {/* Header */}
            <div className="bg-primary-container px-6 pt-6 pb-5">
              <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center mb-3">
                <span className="text-xl">🎙️</span>
              </div>
              <Dialog.Title className="text-xl font-bold text-on-primary-container">
                {isGuest ? strings.welcome.guest_title : strings.welcome.title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-on-primary-container opacity-80 mt-1">
                {isGuest ? strings.welcome.guest_tagline : strings.welcome.tagline}
              </Dialog.Description>
            </div>

            {/* Features */}
            <div className="px-6 py-4 space-y-3">
              {features.map(({ icon, key }) => (
                <div key={key} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-primary mt-0.5">
                    {icon}
                  </div>
                  <p className="text-sm text-on-surface-variant">{strings.about[key]}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-6 pb-5 space-y-2">
              <button
                onClick={handleCta}
                className="flex items-center justify-center w-full bg-brand hover:opacity-90 rounded-xl px-4 py-2.5 text-sm font-medium text-on-surface transition-opacity"
              >
                {isGuest ? strings.welcome.guest_cta : strings.welcome.cta}
              </button>
              {isGuest && (
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-full text-sm text-on-surface-dim hover:text-on-surface-variant transition-colors py-1"
                >
                  {strings.welcome.guest_dismiss}
                </button>
              )}
            </div>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
