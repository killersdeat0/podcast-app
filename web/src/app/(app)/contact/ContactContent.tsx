'use client'

import { Mail, MessageSquare } from 'lucide-react'
import { useStrings } from '@/lib/i18n/LocaleContext'

function ContactCard({ icon, label, email, description }: {
  icon: React.ReactNode
  label: string
  email: string
  description: string
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-container border border-outline-variant">
      <a
        href={`mailto:${email}`}
        className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
        aria-label={`Email ${email}`}
      >
        {icon}
      </a>
      <div>
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        <p className="text-sm text-on-surface-variant select-all">{email}</p>
        <p className="text-xs text-on-surface-dim mt-1">{description}</p>
      </div>
    </div>
  )
}

export default function ContactContent() {
  const strings = useStrings()
  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-on-surface mb-2">{strings.contact.heading}</h1>
      <p className="text-on-surface-variant mb-10">{strings.contact.subheading}</p>

      <div className="space-y-4">
        <ContactCard
          icon={<Mail className="w-5 h-5 text-on-primary-container" />}
          label={strings.contact.support_label}
          email={strings.contact.support_email}
          description={strings.contact.support_description}
        />
        <ContactCard
          icon={<MessageSquare className="w-5 h-5 text-on-primary-container" />}
          label={strings.contact.feedback_label}
          email={strings.contact.feedback_email}
          description={strings.contact.feedback_description}
        />
      </div>

      <p className="mt-10 text-xs text-on-surface-dim">{strings.contact.response_time}</p>
    </div>
  )
}
