import { test, expect } from '@playwright/test'

/**
 * Guest browsing E2E tests — no credentials required.
 * Verifies that unauthenticated users can browse the app and are
 * prompted to sign in only for auth-gated actions.
 */

test('guest can visit /discover without being redirected to /login', async ({ page }) => {
  await page.goto('/discover')
  await expect(page).toHaveURL('/discover', { timeout: 5_000 })
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()
})

test('/login shows "Continue browsing as guest" link', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /continue browsing as guest/i })).toBeVisible()
})

test('/signup shows "Continue browsing as guest" link', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByRole('link', { name: /continue browsing as guest/i })).toBeVisible()
})

test('guest sidebar: queue goes to /queue, history/profile open auth modal', async ({ page }) => {
  await page.goto('/discover')

  // Queue nav link — accessible directly for guests
  const queueLink = page.getByRole('link', { name: /queue/i }).first()
  await expect(queueLink).toBeVisible({ timeout: 5_000 })
  const queueHref = await queueLink.getAttribute('href')
  expect(queueHref).toBe('/queue')

  // History nav — rendered as a button for guests, opens auth modal
  const historyBtn = page.getByRole('button', { name: /history/i }).first()
  await expect(historyBtn).toBeVisible()
  await historyBtn.click()
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible({ timeout: 3_000 })
  // Close modal
  await page.keyboard.press('Escape')

  // Profile nav — also a button for guests
  const profileBtn = page.getByRole('button', { name: /profile/i }).first()
  await expect(profileBtn).toBeVisible()
  await profileBtn.click()
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible({ timeout: 3_000 })
})

test('guest can visit /queue and sees their client queue', async ({ page }) => {
  await page.goto('/queue')
  await expect(page).toHaveURL('/queue', { timeout: 5_000 })
  await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible()
  // Sign-in banner should be present
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
})

test('unauthenticated users are redirected from /history to /login', async ({ page }) => {
  await page.goto('/history')
  await expect(page).toHaveURL('/login', { timeout: 5_000 })
})

test('unauthenticated users are redirected from /profile to /login', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL('/login', { timeout: 5_000 })
})

test.describe('guest podcast page', () => {
  /**
   * These tests visit a real podcast URL. They require the dev server and network access.
   * The podcast page is public so no credentials are needed.
   */

  // A stable iTunes podcast ID for testing (Syntax.fm)
  const PODCAST_ID = '1253186678'
  const PODCAST_FEED = 'https://feed.syntax.fm/rss'
  const PODCAST_TITLE = 'Syntax'
  const PODCAST_ARTWORK = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/5b/33/58/5b335874-3bf5-c5de-0ad3-9fa2f3f5d7c5/mza_8026048613049975670.jpg/626x0w.webp'

  const podcastUrl = `/podcast/${PODCAST_ID}?feed=${encodeURIComponent(PODCAST_FEED)}&title=${encodeURIComponent(PODCAST_TITLE)}&artwork=${encodeURIComponent(PODCAST_ARTWORK)}`

  test('guest can visit podcast page and episodes load', async ({ page }) => {
    await page.goto(podcastUrl)

    // Page heading should show the podcast title
    await expect(page.getByRole('heading', { name: PODCAST_TITLE })).toBeVisible({ timeout: 10_000 })

    // Episodes should load (queue toggle button appears on first episode)
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })
  })

  test('guest subscribe button opens auth prompt modal', async ({ page }) => {
    await page.goto(podcastUrl)

    // Wait for episodes to load so page is fully rendered
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    const subscribeBtn = page.getByRole('button', { name: /^Subscribe$/ })
    await expect(subscribeBtn).toBeVisible()
    await subscribeBtn.click()

    // Auth prompt modal should appear with sign-in options
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('link', { name: /create account/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /maybe later/i })).toBeVisible()
  })

  test('guest navigation warning does NOT fire when leaving podcast page', async ({ page }) => {
    await page.goto(podcastUrl)

    // Wait for the page to fully load
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // Click the Discover nav link — should navigate away without triggering the modal
    const discoverLink = page.getByRole('link', { name: /discover/i }).first()
    await discoverLink.click()

    // Should navigate to /discover without showing a warning modal
    await expect(page).toHaveURL('/discover', { timeout: 5_000 })
    await expect(page.getByText(/unqueued new episodes/i)).not.toBeVisible()
  })
})
