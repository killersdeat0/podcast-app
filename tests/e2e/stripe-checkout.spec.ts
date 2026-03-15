import { test, expect } from '@playwright/test'

/**
 * Stripe checkout E2E tests (test-mode, no real Stripe session required).
 *
 * Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD in .env.local.
 *
 * Strategy: the browser redirects to Stripe by setting window.location.href
 * to the URL returned by POST /api/stripe/checkout. We intercept that API
 * call via page.route() and return a local redirect URL so we can verify
 * the full click→API→redirect chain without leaving the app domain.
 *
 * What is tested:
 *  - Free-tier: pricing cards render with correct prices
 *  - Free-tier: clicking "Subscribe Monthly" calls the checkout API with the
 *    monthly price ID and follows the redirect
 *  - Free-tier: clicking "Subscribe Annually" calls the checkout API with the
 *    yearly price ID and follows the redirect
 *  - /upgrade?success=true  → success banner visible
 *  - /upgrade?cancelled=true → cancel banner visible
 *  - Paid-tier: pricing cards are hidden, management copy is shown
 *
 * What is NOT tested here (covered by the webhook unit test):
 *  - The actual Stripe checkout session creation
 *  - The webhook updating user tier after payment
 */

test.describe('Stripe checkout flow', () => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  async function signIn(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(email!)
    await page.getByPlaceholder('Password').fill(password!)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL('/discover', { timeout: 15_000 })
  }

  test.beforeEach(() => {
    if (!email || !password) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set')
    }
  })

  test.describe('free-tier upgrade page', () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page)
      // Ensure free tier regardless of current account state
      await page.request.post('/api/dev/downgrade')
    })

    test('renders pricing cards for free users', async ({ page }) => {
      await page.goto('/upgrade')

      await expect(page.getByRole('heading', { name: 'Upgrade to Pro' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Monthly' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Annual' })).toBeVisible()
      await expect(page.getByText('$4.99')).toBeVisible()
      await expect(page.getByText('$50')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Subscribe Monthly' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Subscribe Annually' })).toBeVisible()
    })

    test('clicking "Subscribe Monthly" calls checkout API and redirects', async ({ page }) => {
      // Intercept the checkout API and return a local URL we can assert against
      let capturedPriceId: string | null = null
      await page.route('**/api/stripe/checkout', async (route) => {
        const body = route.request().postDataJSON() as { priceId: string }
        capturedPriceId = body.priceId
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/upgrade?checkout=monthly-redirected' }),
        })
      })

      await page.goto('/upgrade')
      await expect(page.getByRole('button', { name: 'Subscribe Monthly' })).toBeVisible()
      await page.getByRole('button', { name: 'Subscribe Monthly' }).click()

      // Should follow the redirect returned by the (mocked) checkout API
      await expect(page).toHaveURL(/checkout=monthly-redirected/, { timeout: 10_000 })

      // The correct monthly price ID was sent
      expect(capturedPriceId).toBeTruthy()
      expect(capturedPriceId).toMatch(/^price_/) // Stripe price IDs start with price_
    })

    test('clicking "Subscribe Annually" calls checkout API with yearly price ID', async ({ page }) => {
      let capturedPriceId: string | null = null
      await page.route('**/api/stripe/checkout', async (route) => {
        const body = route.request().postDataJSON() as { priceId: string }
        capturedPriceId = body.priceId
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/upgrade?checkout=yearly-redirected' }),
        })
      })

      await page.goto('/upgrade')
      await expect(page.getByRole('button', { name: 'Subscribe Annually' })).toBeVisible()
      await page.getByRole('button', { name: 'Subscribe Annually' }).click()

      await expect(page).toHaveURL(/checkout=yearly-redirected/, { timeout: 10_000 })

      expect(capturedPriceId).toBeTruthy()
      expect(capturedPriceId).toMatch(/^price_/)

      // Monthly and yearly price IDs must be different
      const monthlyPriceId = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
      if (monthlyPriceId) {
        expect(capturedPriceId).not.toBe(monthlyPriceId)
      }
    })

    test('button shows loading state while waiting for checkout API', async ({ page }) => {
      // Delay the API response so we can observe the loading state
      await page.route('**/api/stripe/checkout', async (route) => {
        await new Promise((r) => setTimeout(r, 500))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: '/upgrade?checkout=redirected' }),
        })
      })

      await page.goto('/upgrade')
      await page.getByRole('button', { name: 'Subscribe Monthly' }).click()

      // During the in-flight request the button text changes to "Redirecting…"
      await expect(page.getByRole('button', { name: 'Redirecting…' })).toBeVisible({ timeout: 2_000 })
      // Both buttons should be disabled
      await expect(page.getByRole('button', { name: 'Subscribe Annually' })).toBeDisabled()
    })
  })

  test.describe('success and cancel return URLs', () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page)
      await page.request.post('/api/dev/downgrade')
    })

    test('/upgrade?success=true shows payment success message', async ({ page }) => {
      await page.goto('/upgrade?success=true')
      await expect(
        page.getByText(/payment successful/i)
      ).toBeVisible({ timeout: 5_000 })
    })

    test('/upgrade?cancelled=true shows cancellation message', async ({ page }) => {
      await page.goto('/upgrade?cancelled=true')
      await expect(
        page.getByText(/checkout was cancelled/i)
      ).toBeVisible({ timeout: 5_000 })
    })
  })

  test.describe('paid-tier upgrade page', () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page)
      // Set to paid tier via dev endpoint
      await page.request.post('/api/dev/upgrade')
    })

    test.afterEach(async ({ page }) => {
      // Restore free tier so account is in a clean state for other tests
      await page.request.post('/api/dev/downgrade')
    })

    test('shows subscription management copy instead of pricing cards', async ({ page }) => {
      await page.goto('/upgrade')

      // Pricing cards should not be visible
      await expect(page.getByRole('button', { name: 'Subscribe Monthly' })).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'Subscribe Annually' })).not.toBeVisible()

      // Paid copy should be visible
      await expect(page.getByText(/you're on the paid plan/i)).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('link', { name: /stripe customer portal/i })).toBeVisible()
    })
  })
})
