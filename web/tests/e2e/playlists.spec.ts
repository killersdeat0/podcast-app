import { test, expect } from '@playwright/test'

test.describe('playlists user flow', () => {
    const email = process.env.E2E_TEST_EMAIL
    const password = process.env.E2E_TEST_PASSWORD

    test.beforeEach(() => {
        if (!email || !password) {
            test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set')
        }
    })

    test('sign in → create playlist → delete playlist', async ({ page }) => {
        // 1. Sign in
        await page.goto('/login')
        await page.getByPlaceholder('Email').fill(email!)
        await page.getByPlaceholder('Password').fill(password!)
        await page.getByRole('button', { name: 'Log in' }).click()
        await expect(page).toHaveURL('/discover', { timeout: 15_000 })

        // 2. Go to Playlists
        await page.goto('/playlists')
        await expect(page.getByRole('heading', { name: 'Playlists 🎵' })).toBeVisible({ timeout: 10_000 })

        // Clear existing test playlists if any
        const deleteBtns = page.getByTitle('Delete playlist')
        const count = await deleteBtns.count()
        for (let i = 0; i < count; i++) {
            page.once('dialog', dialog => dialog.accept())
            await deleteBtns.nth(0).click()
            await page.waitForTimeout(1000)
        }

        // 3. Create a new playlist
        await page.getByRole('button', { name: 'New Playlist' }).click()
        await page.getByPlaceholder('Playlist name').fill('My E2E Test Playlist')
        await page.getByRole('button', { name: 'Create' }).click()

        // Assert the new playlist card is visible
        await expect(page.locator('p', { hasText: 'My E2E Test Playlist' })).toBeVisible({ timeout: 10_000 })

        // 4. Verify delete works and doesn't trigger navigation
        await page.locator('p', { hasText: 'My E2E Test Playlist' }).first().hover()
        page.once('dialog', dialog => dialog.accept())
        await page.getByTitle('Delete playlist').first().click()

        // Assert it's gone
        await expect(page.locator('p', { hasText: 'My E2E Test Playlist' })).not.toBeVisible({ timeout: 10_000 })
        // Assert we're still on the /playlists page and didn't accidentally navigate
        await expect(page).toHaveURL('/playlists')
    })
})
