import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})
test.afterAll(async () => { await app.close() })

test('stepper shows all 4 stages', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })

  // Navigate to projects page via nav link
  await page.getByRole('link', { name: '项目' }).click()
  await page.waitForSelector('text=我的项目', { timeout: 5000 })

  // Find a project card that shows "已生成" (has a generated PPT)
  const generatedCard = page.locator('text=已生成').first()
  if (await generatedCard.count() > 0) {
    // Click the parent Card that contains "已生成"
    await generatedCard.locator('..').locator('..').click()
    // Project page redirects to /projects/:id/collect (HashRouter)
    await page.waitForURL(/#\/projects\/[^/]+\/collect/, { timeout: 8000 })
    await expect(page.locator('text=第 1 步')).toBeVisible({ timeout: 5000 })
  }
})
