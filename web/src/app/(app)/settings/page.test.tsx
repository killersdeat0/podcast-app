import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SettingsPage from './page'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const mockSignOut = vi.fn()
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
  }),
}))

const mockSetSpeed = vi.fn()
const mockClearNowPlaying = vi.fn()
const mockClearClientQueue = vi.fn()
vi.mock('@/components/player/PlayerContext', () => ({
  usePlayer: () => ({
    setSpeed: mockSetSpeed,
    clearNowPlaying: mockClearNowPlaying,
    clearClientQueue: mockClearClientQueue,
  }),
}))

let mockIsGuest = false
let mockTier: 'free' | 'paid' = 'paid'
vi.mock('@/lib/auth/UserContext', () => ({
  useUser: () => ({ isGuest: mockIsGuest, tier: mockTier }),
}))

let mockLocale = 'en'
const mockSetLocale = vi.fn()
vi.mock('@/lib/i18n/LocaleContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n/LocaleContext')>()
  return {
    ...actual,
    useLocale: () => ({ locale: mockLocale, setLocale: mockSetLocale }),
    // useStrings returns real strings so text assertions match
  }
})

// sonner toast — just capture calls
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
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
  mockTier = 'paid'
  mockLocale = 'en'
  mockSetLocale.mockClear()
  mockSetSpeed.mockClear()
  mockClearNowPlaying.mockClear()
  mockClearClientQueue.mockClear()
  mockPush.mockClear()
  mockRefresh.mockClear()
  mockSignOut.mockReset()
  mockGetUser.mockReset()

  // Default: resolves with an authenticated user
  mockGetUser.mockResolvedValue({ data: { user: { email: 'user@example.com' } } })
  mockSignOut.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSettings() {
  return render(<SettingsPage />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsPage — section rendering', () => {
  it('renders the Playback section heading', () => {
    renderSettings()
    expect(screen.getByText(/playback/i)).toBeTruthy()
  })

  it('renders the Language section heading', () => {
    renderSettings()
    expect(screen.getByRole('heading', { name: /language/i })).toBeTruthy()
  })

  it('renders the Account section for authenticated users', async () => {
    renderSettings()
    expect(screen.getByRole('heading', { name: /account/i })).toBeTruthy()
  })

  it('does not render the Account section for guest users', () => {
    mockIsGuest = true
    renderSettings()
    // Sign out and Delete account buttons must not appear
    expect(screen.queryByText('Sign out')).toBeNull()
    expect(screen.queryByText('Delete account')).toBeNull()
  })

  it('renders the page heading', () => {
    renderSettings()
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('renders default speed selector', () => {
    renderSettings()
    const selects = screen.getAllByRole('combobox')
    // First select is the speed selector
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('renders default volume slider', () => {
    renderSettings()
    const slider = screen.getByRole('slider')
    expect(slider).toBeTruthy()
  })

  it('renders language selector', () => {
    renderSettings()
    // Language selector has English and Español options
    const languageSelect = screen.getByDisplayValue('English')
    expect(languageSelect).toBeTruthy()
  })
})

describe('SettingsPage — localStorage reads on mount', () => {
  it('reads playback-speed from localStorage and pre-selects it', async () => {
    storage['playback-speed'] = '1.5'
    renderSettings()
    // After effect fires, the speed selector should show 1.5
    await waitFor(() => {
      const select = screen.getAllByRole('combobox')[0]
      expect((select as HTMLSelectElement).value).toBe('1.5')
    })
  })

  it('reads playback-volume from localStorage and pre-sets the slider', async () => {
    storage['playback-volume'] = '0.6'
    renderSettings()
    await waitFor(() => {
      const slider = screen.getByRole('slider') as HTMLInputElement
      expect(Number(slider.value)).toBeCloseTo(0.6)
    })
  })

  it('defaults to speed 1 when localStorage has no value', async () => {
    renderSettings()
    await waitFor(() => {
      const select = screen.getAllByRole('combobox')[0]
      expect((select as HTMLSelectElement).value).toBe('1')
    })
  })

  it('defaults to volume 1 when localStorage has no value', async () => {
    renderSettings()
    await waitFor(() => {
      const slider = screen.getByRole('slider') as HTMLInputElement
      expect(Number(slider.value)).toBeCloseTo(1)
    })
  })
})

describe('SettingsPage — default speed selector', () => {
  it('writes new speed to localStorage when changed (paid tier)', async () => {
    mockTier = 'paid'
    renderSettings()

    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '1.5' } })

    expect(storage['playback-speed']).toBe('1.5')
  })

  it('calls setSpeed on the player context when speed changes (paid tier)', () => {
    mockTier = 'paid'
    renderSettings()

    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '1.75' } })

    expect(mockSetSpeed).toHaveBeenCalledWith(1.75)
  })

  it('does NOT write to localStorage on speed change for free tier', () => {
    mockTier = 'free'
    renderSettings()

    // Free tier only shows 1x and 2x options
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '2' } })

    // Free tier writes are blocked in handleSpeedChange
    expect(storage['playback-speed']).toBeUndefined()
  })

  it('disables speed selector for free-tier users', () => {
    mockTier = 'free'
    renderSettings()

    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('shows upgrade link for free-tier users', () => {
    mockTier = 'free'
    renderSettings()

    const link = screen.getByRole('link', { name: /upgrade/i })
    expect(link).toBeTruthy()
    expect((link as HTMLAnchorElement).href).toContain('/upgrade')
  })
})

describe('SettingsPage — default volume slider', () => {
  it('writes new volume to localStorage when slider changes', () => {
    renderSettings()

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0.4' } })

    expect(storage['playback-volume']).toBe('0.4')
  })

  it('displays the volume as a percentage', async () => {
    storage['playback-volume'] = '0.5'
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('50%')).toBeTruthy()
    })
  })
})

describe('SettingsPage — language selector', () => {
  it('shows the current locale as selected', () => {
    mockLocale = 'es'
    renderSettings()

    const select = screen.getByDisplayValue('Español')
    expect(select).toBeTruthy()
  })

  it('calls setLocale when a new language is selected', () => {
    mockLocale = 'en'
    renderSettings()

    const select = screen.getByDisplayValue('English')
    fireEvent.change(select, { target: { value: 'es' } })

    expect(mockSetLocale).toHaveBeenCalledWith('es')
  })

  it('calls setLocale with "en" when switching back to English', () => {
    mockLocale = 'es'
    renderSettings()

    const select = screen.getByDisplayValue('Español')
    fireEvent.change(select, { target: { value: 'en' } })

    expect(mockSetLocale).toHaveBeenCalledWith('en')
  })
})

describe('SettingsPage — sign out', () => {
  it('renders a Sign out button for authenticated users', () => {
    renderSettings()
    expect(screen.getByText('Sign out')).toBeTruthy()
  })

  it('calls supabase signOut when the button is clicked', async () => {
    renderSettings()

    const btn = screen.getByText('Sign out')
    await act(async () => { fireEvent.click(btn) })

    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('redirects to /login after sign out', async () => {
    renderSettings()

    const btn = screen.getByText('Sign out')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })

  it('calls clearNowPlaying and clearClientQueue on sign out', async () => {
    renderSettings()

    const btn = screen.getByText('Sign out')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(mockClearNowPlaying).toHaveBeenCalled()
      expect(mockClearClientQueue).toHaveBeenCalled()
    })
  })

  it('removes welcome toast localStorage keys on sign out', async () => {
    storage['guestToastShown'] = 'true'
    storage['welcomeToastShownAt'] = '12345'

    renderSettings()
    const btn = screen.getByText('Sign out')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(storage['guestToastShown']).toBeUndefined()
      expect(storage['welcomeToastShownAt']).toBeUndefined()
    })
  })
})

describe('SettingsPage — delete account confirmation dialog', () => {
  it('renders the Delete account trigger button', () => {
    renderSettings()
    expect(screen.getByText('Delete account')).toBeTruthy()
  })

  it('opens the confirmation dialog when Delete account is clicked', async () => {
    renderSettings()

    fireEvent.click(screen.getByText('Delete account'))

    await waitFor(() => {
      expect(screen.getByText('Delete your account?')).toBeTruthy()
    })
  })

  it('shows the warning body text inside the dialog', async () => {
    renderSettings()
    fireEvent.click(screen.getByText('Delete account'))

    await waitFor(() => {
      expect(screen.getByText(/cannot be undone/i)).toBeTruthy()
    })
  })

  it('closes the dialog when Cancel is clicked', async () => {
    renderSettings()
    fireEvent.click(screen.getByText('Delete account'))

    await waitFor(() => screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Delete your account?')).toBeNull()
    })
  })

  it('shows a contact-support toast when no delete API exists', async () => {
    const { toast } = await import('sonner')

    // Simulate API returning 404 (endpoint not yet implemented)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    renderSettings()
    fireEvent.click(screen.getByText('Delete account'))
    await waitFor(() => screen.getByText('Yes, delete my account'))
    await act(async () => { fireEvent.click(screen.getByText('Yes, delete my account')) })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('support'))
    })

    vi.unstubAllGlobals()
    // Re-stub localStorage since unstubAllGlobals removes it
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v },
      removeItem: (k: string) => { delete storage[k] },
      clear: () => { Object.keys(storage).forEach((k) => delete storage[k]) },
    })
  })
})
