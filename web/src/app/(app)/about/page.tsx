'use client'

import { useRouter } from 'next/navigation'
import AboutModal from '@/components/ui/AboutModal'

export default function AboutPage() {
  const router = useRouter()
  return <AboutModal open onClose={() => router.back()} />
}
