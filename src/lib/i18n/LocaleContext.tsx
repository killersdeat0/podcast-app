'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getStrings, defaultLocale } from './index'
import type { Locale } from './index'

const STORAGE_KEY = 'podsync-locale'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
}

const LocaleContext = createContext<{
  locale: Locale
  setLocale: (locale: Locale) => void
  strings: ReturnType<typeof getStrings>
}>({
  locale: defaultLocale,
  setLocale: () => {},
  strings: getStrings(defaultLocale),
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored && stored in LOCALE_LABELS) {
      setLocaleState(stored)
    }
  }, [])

  function setLocale(next: Locale) {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, strings: getStrings(locale) }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useStrings() {
  return useContext(LocaleContext).strings
}

export function useLocale() {
  const { locale, setLocale } = useContext(LocaleContext)
  return { locale, setLocale }
}
