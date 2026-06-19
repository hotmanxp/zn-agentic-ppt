import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})
test.afterAll(async () => { await app.close() })

test('4-stage stepper visible on collect page', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })

  // Navigate to projects page via nav link
  await page.getByRole('link', { name: '项目' }).click()
  await page.waitForSelector('text=我的项目', { timeout: 5000 })

  // Click first project card to enter it (redirects to /collect)
  const firstCard = page.locator('.ant-card').first()
  if (await firstCard.count() === 0) {
    test.skip()
    return
  }
  await firstCard.click()
  await page.waitForURL(/#\/projects\/[^/]+\/collect/, { timeout: 8000 })

  // Verify stepper renders with all 4 stages
  await expect(page.getByText('第 1 步')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('link', { name: '内容收集' })).toBeVisible()
  await expect(page.getByRole('link', { name: '生成大纲' })).toBeVisible()
  await expect(page.getByRole('link', { name: '细节微调' })).toBeVisible()
})
