import { test, expect } from '@playwright/test'

test('login page has a non-empty title', async ({ page }) => {
  await page.goto('/login')
  const title = await page.title()
  expect(title.length).toBeGreaterThan(0)
})
