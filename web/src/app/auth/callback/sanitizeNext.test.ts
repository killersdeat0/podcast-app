import { describe, it, expect } from 'vitest'

/** Inline copy of the sanitizeNext helper from route.ts for unit testing */
function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return raw
}

describe('sanitizeNext', () => {
  it('accepts safe relative paths', () => {
    expect(sanitizeNext('/discover')).toBe('/discover')
    expect(sanitizeNext('/podcast/123')).toBe('/podcast/123')
    expect(sanitizeNext('/reset-password')).toBe('/reset-password')
    expect(sanitizeNext('/playlist/abc?foo=bar')).toBe('/playlist/abc?foo=bar')
  })

  it('returns null for null input', () => {
    expect(sanitizeNext(null)).toBeNull()
  })

  it('blocks external URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBeNull()
    expect(sanitizeNext('http://evil.com')).toBeNull()
  })

  it('blocks protocol-relative URLs', () => {
    expect(sanitizeNext('//evil.com')).toBeNull()
    expect(sanitizeNext('//evil.com/path')).toBeNull()
  })

  it('blocks javascript: and other scheme injections', () => {
    expect(sanitizeNext('/javascript:alert(1)')).toBeNull()
    expect(sanitizeNext('/data:text/html,<h1>evil</h1>')).toBeNull()
  })

  it('blocks paths that do not start with /', () => {
    expect(sanitizeNext('evil.com')).toBeNull()
    expect(sanitizeNext('discover')).toBeNull()
  })
})
