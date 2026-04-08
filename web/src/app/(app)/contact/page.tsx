import type { Metadata } from 'next'
import ContactContent from './ContactContent'

export const metadata: Metadata = {
  title: 'Contact — SyncPods',
  description: "Get in touch with the SyncPods team. We'd love to hear from you.",
}

export default function ContactPage() {
  return <ContactContent />
}
