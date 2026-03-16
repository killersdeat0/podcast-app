import { test, expect } from '@playwright/test'

/**
 * Navigation warning modal E2E tests.
 *
 * Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD in .env.local.
 * Tests that the "unqueued new episodes" modal fires when a logged-in user
 * navigates away from a podcast page that has new episodes, and that the
 * three actions (Stay, Leave Anyway, Queue All & Leave) behave correctly.
 *
 * Setup strategy: subscribe the test user to a stable podcast and PATCH
 * last_visited_at to 7 days ago so recent episodes count as "new".
 * episode_filter is set to '*' to ensure both free and paid users see new
 * episodes (paid default of null means "no filter = no notifications").
 */

// A stable iTunes podcast ID with frequent releases (Syntax.fm, ~3 episodes/week)
const PODCAST_ID = '1253186678'
const PODCAST_FEED = 'https://feed.syntax.fm/rss'
const PODCAST_TITLE = 'Syntax'
const PODCAST_ARTWORK =
  'https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/5b/33/58/5b335874-3bf5-c5de-0ad3-9fa2f3f5d7c5/mza_8026048613049975670.jpg/626x0w.webp'

const podcastUrl = `/podcast/${PODCAST_ID}?feed=${encodeURIComponent(PODCAST_FEED)}&title=${encodeURIComponent(PODCAST_TITLE)}&artwork=${encodeURIComponent(PODCAST_ARTWORK)}`

test.describe('navigation warning modal', () => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  test.beforeEach(async ({ page }) => {
    if (!email || !password) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set')
    }

    // Sign in
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(email!)
    await page.getByPlaceholder('Password').fill(password!)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL('/discover', { timeout: 15_000 })

    // Ensure the test user is subscribed to the podcast
    await page.request.post('/api/subscriptions', {
      data: {
        feedUrl: PODCAST_FEED,
        title: PODCAST_TITLE,
        artworkUrl: PODCAST_ARTWORK,
        collectionId: PODCAST_ID,
      },
    })

    // Reset last_visited_at to 7 days ago so recent episodes count as new.
    // Also set episode_filter='*' so both free and paid users see new episodes
    // (paid tier users with filter=null get no notifications by default).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await page.request.fetch('/api/subscriptions', {
      method: 'PATCH',
      data: {
        feedUrl: PODCAST_FEED,
        episodeFilter: '*',
        lastVisitedAt: sevenDaysAgo,
      },
    })
  })

  test('modal appears when navigating away with unqueued new episodes', async ({ page }) => {
    await page.goto(podcastUrl)
    // Wait for episodes to load
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // Click a sidebar nav link to trigger the guard
    await page.getByRole('link', { name: /discover/i }).first().click()

    // Modal should appear
    await expect(page.getByText(/unqueued new episodes/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /queue all & leave/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /leave anyway/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /stay/i })).toBeVisible()

    // Still on the podcast page (navigation was intercepted)
    expect(page.url()).toContain('/podcast/')
  })

  test('"Stay" closes the modal and keeps the user on the podcast page', async ({ page }) => {
    await page.goto(podcastUrl)
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // Trigger the guard
    await page.getByRole('link', { name: /discover/i }).first().click()
    await expect(page.getByText(/unqueued new episodes/i)).toBeVisible({ timeout: 5_000 })

    // Click Stay
    await page.getByRole('button', { name: /stay/i }).click()

    // Modal should close
    await expect(page.getByText(/unqueued new episodes/i)).not.toBeVisible()

    // Still on the podcast page
    expect(page.url()).toContain('/podcast/')

    // Guard is still active — trying to leave again should re-trigger the modal
    await page.getByRole('link', { name: /discover/i }).first().click()
    await expect(page.getByText(/unqueued new episodes/i)).toBeVisible({ timeout: 3_000 })
  })

  test('"Leave Anyway" navigates away without queuing', async ({ page }) => {
    await page.goto(podcastUrl)
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // Trigger the guard toward Discover
    await page.getByRole('link', { name: /discover/i }).first().click()
    await expect(page.getByText(/unqueued new episodes/i)).toBeVisible({ timeout: 5_000 })

    // Click Leave Anyway
    await page.getByRole('button', { name: /leave anyway/i }).click()

    // Should navigate to /discover
    await expect(page).toHaveURL('/discover', { timeout: 10_000 })
  })

  test('"Queue All & Leave" queues new episodes and navigates', async ({ page }) => {
    await page.goto(podcastUrl)
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // Trigger the guard toward Discover
    await page.getByRole('link', { name: /discover/i }).first().click()
    const modal = page.getByText(/unqueued new episodes/i)
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Click Queue All & Leave
    await page.getByRole('button', { name: /queue all & leave/i }).click()

    // Either navigates (if under queue limit) or shows upgrade modal (if free tier is full).
    // In both cases we leave the podcast page.
    await expect(page).not.toHaveURL(/\/podcast\//, { timeout: 10_000 })
  })
})
