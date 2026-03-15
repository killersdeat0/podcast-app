import en from './locales/en'
import es from './locales/es'

export type Locale = 'en' | 'es'

export const defaultLocale: Locale = 'en'

const locales = { en, es } satisfies Record<Locale, typeof en>

export function getStrings(locale: Locale = defaultLocale) {
  return locales[locale] ?? locales[defaultLocale]
}

// Convenience export for the default locale — use this in most components
export const strings = getStrings(defaultLocale)
