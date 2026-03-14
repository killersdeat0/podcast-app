import { test, expect } from '@playwright/test'

/**
 * Sign-up page smoke test — no credentials required.
 * Verifies the page loads and the form is present.
 */
test('sign-up page renders with correct form fields', async ({ page }) => {
  await page.goto('/signup')

  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible()

  // Should have a link back to /login for existing users.
  await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
})

/**
 * Core user flow E2E test.
 *
 * Requires the following environment variables to be set:
 *   E2E_TEST_EMAIL    — email address of a seeded test account
 *   E2E_TEST_PASSWORD — password of that account
 *
 * If either variable is absent the test is skipped automatically.
 * Run against a live server: `npx playwright test --headed`
 */
test.describe('core user flow', () => {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  test.beforeEach(() => {
    // Skip the entire suite when credentials are unavailable so CI doesn't
    // fail on branches that haven't configured the secrets yet.
    if (!email || !password) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set')
    }
  })

  test('sign in → discover → podcast page → subscribe → play → add to queue → queue page', async ({ page }) => {
    // ─── Step 1: navigate to /login ───────────────────────────────────────
    await page.goto('/login')

    // ─── Step 2: sign in with email + password ────────────────────────────
    // AuthForm renders a plain <input type="email" placeholder="Email"> and
    // <input type="password" placeholder="Password"> with no explicit labels,
    // so we target them by placeholder text.
    await page.getByPlaceholder('Email').fill(email!)
    await page.getByPlaceholder('Password').fill(password!)

    // The submit button text is "Log in" in login mode.
    await page.getByRole('button', { name: 'Log in' }).click()

    // ─── Step 3: assert redirected to /discover ───────────────────────────
    // router.push('/discover') fires after successful Supabase auth.
    // Allow generous time because Supabase round-trip can be slow.
    await expect(page).toHaveURL('/discover', { timeout: 15_000 })

    // The Discover page always renders an <h1>Discover</h1>.
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()

    // ─── Step 4: search for a podcast ────────────────────────────────────
    // The search input uses placeholder="Search podcasts..."
    await page.getByPlaceholder('Search podcasts...').fill('Syntax')

    // The submit button shows "Search" (or "..." while loading).
    await page.getByRole('button', { name: 'Search' }).click()

    // Dismiss autocomplete dropdown (it intercepts clicks on the results grid)
    await page.keyboard.press('Escape')

    // ─── Step 5: assert at least one search result appears ───────────────
    // Each result card is a <Link> wrapping the podcast name in a <p> with
    // class "font-medium text-sm text-white truncate". We wait for the grid
    // to populate; the iTunes API is fast but needs a network round-trip.
    // We use a locator that matches any podcast result card in the grid.
    // The grid contains <a> elements that each include an <img alt=…> for
    // the podcast artwork. Waiting for the first image's alt to appear is a
    // clean proxy for "results rendered".
    const firstResult = page
      .locator('div.grid a')  // result grid links
      .first()

    await expect(firstResult).toBeVisible({ timeout: 15_000 })

    // ─── Step 6: click the first result ──────────────────────────────────
    // Capture the podcast title so we can assert it on the next page.
    const firstResultTitle = await firstResult.locator('p').first().textContent()
    await firstResult.click()

    // ─── Step 7: assert the episode list loads ────────────────────────────
    // PodcastPage renders each episode as a <button> (the play button) whose
    // first child <p> contains the episode title. We wait for at least one
    // such button to appear — RSS fetching can be slow (5-30 s).
    //
    // The episode play buttons are the flex-1 buttons inside each episode row.
    // We distinguish them from the queue-toggle button by their role + the
    // text they contain (episode titles are arbitrary strings, but all
    // episode rows contain a date string). A simpler proxy: wait for the
    // first element that is a button inside the episode list container.
    // The podcast page <h1> shows the podcast title passed via query param.
    await expect(page.getByRole('heading', { name: firstResultTitle ?? /.*/ })).toBeVisible({
      timeout: 10_000,
    })

    // Wait for episodes to load. Each episode row contains a play <button>
    // and a queue-toggle <button title="Add to queue">. We wait for the
    // "Add to queue" title on the first episode's queue button.
    // The queue toggle button uses title="Add to queue" but its visible text is "+"
    // so we must use getByTitle, not getByRole name.
    const firstQueueToggle = page.getByTitle('Add to queue').first()

    await expect(firstQueueToggle).toBeVisible({ timeout: 30_000 })

    // Also confirm at least one episode title <p> rendered in an episode row.
    const firstEpisodeTitle = page.locator('button.flex-1 p.font-medium').first()
    await expect(firstEpisodeTitle).toBeVisible({ timeout: 5_000 })

    // ─── Step 7b: subscribe to the podcast ───────────────────────────────
    // The subscribe button shows "Subscribe" or "Subscribed" depending on
    // current state. Click it and verify it toggles to the opposite state.
    const subscribeBtn = page.getByRole('button', { name: /^Subscri/ })
    await expect(subscribeBtn).toBeVisible({ timeout: 5_000 })
    const wasSubscribed = (await subscribeBtn.textContent()) === 'Subscribed'
    await subscribeBtn.click()
    const expectedSubscribeText = wasSubscribed ? 'Subscribe' : 'Subscribed'
    await expect(subscribeBtn).toHaveText(expectedSubscribeText, { timeout: 10_000 })

    // ─── Step 7c: play the first episode ─────────────────────────────────
    // Each episode row has a flex-1 play button. Clicking it calls play()
    // on PlayerContext, which sets nowPlaying and updates the <audio> src.
    const firstPlayBtn = page.locator('button.flex-1').first()
    await firstPlayBtn.click()

    // The <audio> element always exists in the DOM (renders unconditionally).
    // Once an episode is played its src attribute is set to the audio URL.
    await expect(page.locator('audio')).toHaveAttribute('src', /.+/, { timeout: 10_000 })

    // ─── Step 8: click "Add to Queue" on the first episode ───────────────
    await firstQueueToggle.click()

    // After clicking, the button switches to title="Remove from queue"
    await expect(page.getByTitle('Remove from queue').first()).toBeVisible({ timeout: 5_000 })

    // ─── Step 9: navigate to /queue ──────────────────────────────────────
    await page.goto('/queue')

    // ─── Step 10: assert the episode appears in the queue ─────────────────
    // QueuePage renders an <h1>Queue</h1> and then each item as a
    // SortableQueueItem. The episode title is shown in a <p class="text-sm
    // font-medium text-white truncate">. We can confirm the queue is non-
    // empty by looking for a button with title="Remove from queue" (the ✕
    // button rendered on each queue row).
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible({ timeout: 10_000 })

    // The queue page fetches from /api/queue on mount. Give it time.
    await expect(page.getByTitle('Remove from queue').first()).toBeVisible({ timeout: 10_000 })

    // Extra: confirm the episode title we added is visible somewhere on the
    // queue page. We capture the episode title text from the podcast page
    // earlier; the queue page renders the same text.
    const episodeTitleText = await firstEpisodeTitle.textContent()
    if (episodeTitleText) {
      await expect(page.getByText(episodeTitleText, { exact: false })).toBeVisible({
        timeout: 5_000,
      })
    }
  })
})
