import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AppToasts from './AppToasts'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}))

let mockIsGuest = false
vi.mock('@/lib/auth/UserContext', () => ({
  useUser: () => ({ isGuest: mockIsGuest }),
}))

vi.mock('@/lib/i18n/LocaleContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n/LocaleContext')>()
  return { ...actual }
})

const mockOnAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { onAuthStateChange: mockOnAuthStateChange },
  }),
}))

// WelcomeModal — just render a div so we can detect it by title text
vi.mock('@/components/ui/WelcomeModal', () => ({
  default: ({ open, variant }: { open: boolean; variant: string }) =>
    open ? <div data-testid={`welcome-modal-${variant}`} /> : null,
}))

// ── localStorage stub ──────────────────────────────────────────────────────────

let storage: Record<string, string> = {}

beforeEach(() => {
  storage = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v },
    removeItem: (k: string) => { delete storage[k] },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]) },
  })
  mockIsGuest = false
  mockOnAuthStateChange.mockClear()
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Welcome modal (user variant) ───────────────────────────────────────────────

describe('AppToasts — user welcome modal', () => {
  it('shows the user welcome modal when pendingWelcomeModal is set', async () => {
    storage['pendingWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal-user')).toBeTruthy()
    })
  })

  it('removes pendingWelcomeModal from localStorage after showing', async () => {
    storage['pendingWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(storage['pendingWelcomeModal']).toBeUndefined()
    })
  })

  it('sets welcomeModalShown after consuming pendingWelcomeModal', async () => {
    storage['pendingWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(storage['welcomeModalShown']).toBe('1')
    })
  })

  it('does NOT show the user welcome modal when pendingWelcomeModal is absent', async () => {
    render(<AppToasts />)
    // Give effects a tick
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('welcome-modal-user')).toBeNull()
  })

  it('shows the modal for a guest-to-user conversion (guestToastShown set, not new user)', async () => {
    mockIsGuest = false
    storage['guestToastShown'] = '1'
    // welcomeModalShown NOT set — first time on this device after guest conversion
    render(<AppToasts />)

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal-user')).toBeTruthy()
    })
  })

  it('does NOT show modal for guest-to-user conversion if welcomeModalShown already set', async () => {
    mockIsGuest = false
    storage['guestToastShown'] = '1'
    storage['welcomeModalShown'] = '1'
    render(<AppToasts />)

    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('welcome-modal-user')).toBeNull()
  })
})

// ── Guest welcome modal ────────────────────────────────────────────────────────

describe('AppToasts — guest welcome modal', () => {
  it('shows the guest welcome modal when pendingGuestWelcomeModal is set', async () => {
    storage['pendingGuestWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal-guest')).toBeTruthy()
    })
  })

  it('removes pendingGuestWelcomeModal after showing', async () => {
    storage['pendingGuestWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(storage['pendingGuestWelcomeModal']).toBeUndefined()
    })
  })

  it('shows the guest modal every time pendingGuestWelcomeModal is set (no once-only guard)', async () => {
    // Simulate a second guest session — no guestWelcomeShown guard should block it
    storage['pendingGuestWelcomeModal'] = '1'
    render(<AppToasts />)

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal-guest')).toBeTruthy()
    })
  })

  it('does NOT show the guest modal when flag is absent', async () => {
    render(<AppToasts />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('welcome-modal-guest')).toBeNull()
  })
})
