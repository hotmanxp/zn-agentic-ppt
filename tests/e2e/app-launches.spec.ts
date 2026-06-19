import { test, expect } from '@playwright/test'

test('app launches and shows welcome page', async ({ page }) => {
  await page.waitForSelector('text=⬢ ZN Agentic PPT')
  await expect(page.locator('text=用 AI 几秒生成演示文稿')).toBeVisible()
})
