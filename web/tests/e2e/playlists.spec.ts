import { test, expect } from '@playwright/test'

// Stable Syntax.fm podcast used as a fixture for adding episodes to playlists
const PODCAST_ID = '1253186678'
const PODCAST_FEED = 'https://feed.syntax.fm/rss'
const PODCAST_TITLE = 'Syntax'
const PODCAST_ARTWORK =
  'https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/5b/33/58/5b335874-3bf5-c5de-0ad3-9fa2f3f5d7c5/mza_8026048613049975670.jpg/626x0w.webp'
const podcastUrl = `/podcast/${PODCAST_ID}?feed=${encodeURIComponent(PODCAST_FEED)}&title=${encodeURIComponent(PODCAST_TITLE)}&artwork=${encodeURIComponent(PODCAST_ARTWORK)}`

// ─── Helper: sign in ──────────────────────────────────────────────────────────

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/discover', { timeout: 15_000 })
}

// ─── Helper: delete all playlists with a given name on /playlists ─────────────
// Scopes the delete button click to the matching card to avoid accidentally
// deleting a different playlist when multiple cards are present.

async function deletePlaylistsByName(page: import('@playwright/test').Page, name: string) {
  await page.goto('/playlists')
  await expect(page.getByRole('heading', { name: /Playlists/ })).toBeVisible({ timeout: 10_000 })
  // Cards may need a moment to render after page load
  await page.waitForTimeout(500)
  while (true) {
    // Scope to the specific card that contains this playlist name
    const card = page
      .locator('div.group')
      .filter({ has: page.locator('p.font-medium', { hasText: name }) })
      .first()
    if (!(await card.isVisible())) break
    page.once('dialog', (d) => d.accept())
    await card.getByTitle('Delete playlist').click()
    await page.waitForTimeout(800)
  }
}

// ─── Tests requiring credentials ─────────────────────────────────────────────

test.describe('playlists user flow', () => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  test.beforeEach(() => {
    if (!email || !password) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set')
    }
  })

  // ── Existing CRUD smoke test ───────────────────────────────────────────────

  test('sign in → create playlist → delete playlist', async ({ page }) => {
    await signIn(page, email!, password!)

    // Go to Playlists and clear any leftover test playlists
    await page.goto('/playlists')
    await expect(page.getByRole('heading', { name: /Playlists/ })).toBeVisible({ timeout: 10_000 })
    const deleteBtns = page.getByTitle('Delete playlist')
    const count = await deleteBtns.count()
    for (let i = 0; i < count; i++) {
      page.once('dialog', (dialog) => dialog.accept())
      await deleteBtns.nth(0).click()
      await page.waitForTimeout(1000)
    }

    // Create a new playlist
    await page.getByRole('button', { name: 'New Playlist' }).click()
    await page.getByPlaceholder('Playlist name').fill('My E2E Test Playlist')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.locator('p', { hasText: 'My E2E Test Playlist' })).toBeVisible({ timeout: 10_000 })

    // Delete it and verify we stay on /playlists
    await page.locator('p', { hasText: 'My E2E Test Playlist' }).first().hover()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTitle('Delete playlist').first().click()
    await expect(page.locator('p', { hasText: 'My E2E Test Playlist' })).not.toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL('/playlists')
  })

  // ── Create → add episode → play → assert audio ────────────────────────────

  test('create playlist → add episode → play playlist → audio starts', async ({ page }) => {
    await signIn(page, email!, password!)

    // Clean up any leftover playlists from previous runs
    await deletePlaylistsByName(page, 'E2E Playback Test')

    // Create the playlist
    await page.getByRole('button', { name: 'New Playlist' }).click()
    await page.getByPlaceholder('Playlist name').fill('E2E Playback Test')
    await page.getByRole('button', { name: 'Create' }).click()

    // Grab the href so we can navigate back to it later
    const playlistCard = page.locator('a[href^="/playlist/"]', { hasText: 'E2E Playback Test' })
    await expect(playlistCard).toBeVisible({ timeout: 10_000 })
    const playlistHref = await playlistCard.getAttribute('href')
    expect(playlistHref).toBeTruthy()

    // Navigate to a podcast page and wait for episodes to load
    await page.goto(podcastUrl)
    await expect(page.getByRole('heading', { name: PODCAST_TITLE })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTitle('Add to queue').first()).toBeVisible({ timeout: 30_000 })

    // The "Add to Playlist" trigger button (ListPlus icon) only renders once the
    // podcast page has fetched the user's playlists. Wait for it to attach.
    await expect(page.getByTitle('Add to Playlist').first()).toBeAttached({ timeout: 15_000 })

    // The button is opacity-0 until hover, so use force click.
    await page.getByTitle('Add to Playlist').first().click({ force: true })

    // Select the playlist from the popover
    await page.getByRole('button', { name: 'E2E Playback Test' }).first().click()

    // The popover's onSelect is async — wait for the trigger button to reach the
    // "added" state (text-green-400 class) before navigating. This confirms the
    // POST /api/playlists/[id]/episodes call completed successfully.
    await expect(page.getByTitle('Add to Playlist').first()).toHaveClass(/text-green-400/, {
      timeout: 10_000,
    })

    // Navigate to the playlist detail page
    await page.goto(playlistHref!)
    await expect(page.getByRole('heading', { name: 'E2E Playback Test' })).toBeVisible({ timeout: 10_000 })

    // Wait for at least one episode to appear in the list
    await expect(page.locator('button.flex-1').first()).toBeVisible({ timeout: 10_000 })

    // Play the playlist
    await page.getByRole('button', { name: 'Play Playlist' }).click()

    // Assert the audio element has a src set (episode loaded into player)
    await expect(page.locator('audio')).toHaveAttribute('src', /.+/, { timeout: 10_000 })

    // Clean up: delete the playlist
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete playlist' }).click()
    await expect(page).toHaveURL('/playlists', { timeout: 10_000 })
  })

  // ── Create → make public → guest context sees blocking modal ──────────────

  test('make playlist public → guest context → blocking auth modal shown', async ({ page, browser }) => {
    await signIn(page, email!, password!)
    await deletePlaylistsByName(page, 'E2E Public Test')

    // Create a playlist
    await page.getByRole('button', { name: 'New Playlist' }).click()
    await page.getByPlaceholder('Playlist name').fill('E2E Public Test')
    await page.getByRole('button', { name: 'Create' }).click()

    // Navigate to the playlist detail page
    const playlistCard = page.locator('a[href^="/playlist/"]', { hasText: 'E2E Public Test' })
    await expect(playlistCard).toBeVisible({ timeout: 10_000 })
    await playlistCard.click()
    await expect(page.getByRole('heading', { name: 'E2E Public Test' })).toBeVisible({ timeout: 10_000 })

    // Make the playlist public
    await page.getByRole('button', { name: 'Make public' }).click()
    await expect(page.getByRole('button', { name: 'Make private' })).toBeVisible({ timeout: 5_000 })

    // Record the playlist URL
    const playlistUrl = page.url()
    expect(playlistUrl).toMatch(/\/playlist\/[a-z0-9-]+/)

    // Open an unauthenticated context (no cookies) and visit the public playlist URL
    const guestContext = await browser.newContext()
    const guestPage = await guestContext.newPage()
    await guestPage.goto(playlistUrl)

    // Page should load (no redirect to /login — /playlist is a PUBLIC_PATH)
    await expect(guestPage).toHaveURL(playlistUrl, { timeout: 10_000 })

    // A non-dismissable blocking auth modal should appear for guests
    await expect(guestPage.getByText(/Sign in to view this playlist/i)).toBeVisible({ timeout: 10_000 })

    await guestContext.close()

    // Clean up: delete the playlist from the owner context
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete playlist' }).click()
    await expect(page).toHaveURL('/playlists', { timeout: 10_000 })
  })

  // ── Free tier at limit → create button disabled, warning shown ────────────
  //
  // NOTE: This test requires the E2E test account to be on the FREE tier.
  // If the account is on a paid plan the limit is never reached and the test
  // exits early (no false failure).

  test('free user at playlist limit → create button disabled, warning visible', async ({ page }) => {
    await signIn(page, email!, password!)

    // Clear all existing playlists so we start from zero
    await page.goto('/playlists')
    await expect(page.getByRole('heading', { name: /Playlists/ })).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)
    const deleteBtns = page.getByTitle('Delete playlist')
    let remaining = await deleteBtns.count()
    while (remaining > 0) {
      page.once('dialog', (d) => d.accept())
      await deleteBtns.first().click()
      await page.waitForTimeout(800)
      remaining = await deleteBtns.count()
    }

    // Create 3 playlists (the free-tier limit)
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: 'New Playlist' }).click()
      await page.getByPlaceholder('Playlist name').fill(`E2E Limit Test ${i}`)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.locator('p.font-medium', { hasText: `E2E Limit Test ${i}` })).toBeVisible({
        timeout: 10_000,
      })
    }

    // If the limit warning is not visible, the account is on a paid plan — skip
    const limitWarning = page.getByText(/Free plan allows up to 3 playlists/)
    const isAtLimit = await limitWarning.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!isAtLimit) {
      // Clean up the 3 test playlists before exiting, scoped to each named card
      for (let i = 1; i <= 3; i++) {
        const card = page
          .locator('div.group')
          .filter({ has: page.locator('p.font-medium', { hasText: `E2E Limit Test ${i}` }) })
          .first()
        if (await card.isVisible()) {
          page.once('dialog', (d) => d.accept())
          await card.getByTitle('Delete playlist').click()
          await page.waitForTimeout(800)
        }
      }
      test.skip(true, 'Test account is on paid tier — free-tier limit does not apply')
      return
    }

    // Assert the warning is shown and the create button is disabled
    await expect(limitWarning).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Playlist' })).toBeDisabled()

    // Clean up the 3 test playlists, scoped to each named card
    for (let i = 1; i <= 3; i++) {
      const card = page
        .locator('div.group')
        .filter({ has: page.locator('p.font-medium', { hasText: `E2E Limit Test ${i}` }) })
        .first()
      if (await card.isVisible()) {
        page.once('dialog', (d) => d.accept())
        await card.getByTitle('Delete playlist').click()
        await page.waitForTimeout(800)
      }
    }
  })
})

// ─── Guest access tests (no credentials required) ─────────────────────────────

test.describe('playlist guest access', () => {
  // /playlists is effectively public because the proxy PUBLIC_PATH '/playlist'
  // matches via startsWith — guests see a sign-in empty state, not a redirect.
  test('guest visits /playlists → page loads with sign-in CTA', async ({ page }) => {
    await page.goto('/playlists')
    await expect(page).toHaveURL('/playlists', { timeout: 5_000 })
    await expect(page.getByRole('heading', { name: /Playlists/ })).toBeVisible()
    // Guest empty state shows a sign-in link
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
  })

  // Requires E2E_PUBLIC_PLAYLIST_ID — a pre-existing public playlist in the DB.
  // Set this variable in web/.env.local before running.
  test('guest visits public playlist → page loads with blocking auth modal', async ({ page }) => {
    const playlistId = process.env.E2E_PUBLIC_PLAYLIST_ID
    if (!playlistId) {
      test.skip(true, 'E2E_PUBLIC_PLAYLIST_ID is not set')
      return
    }
    await page.goto(`/playlist/${playlistId}`)
    // Should NOT redirect to /login
    await expect(page).toHaveURL(`/playlist/${playlistId}`, { timeout: 10_000 })
    // Non-dismissable blocking auth modal should appear
    await expect(page.getByText(/Sign in to view this playlist/i)).toBeVisible({ timeout: 10_000 })
  })
})
