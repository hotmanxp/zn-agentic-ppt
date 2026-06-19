import { test, expect, _electron as electron } from '@playwright/test'

let app: Awaited<ReturnType<typeof electron.launch>>

test.beforeAll(async () => {
  app = await electron.launch({ args: ['.'], cwd: '.' })
})

test.afterAll(async () => {
  await app.close()
})

test('create → modal opens', async () => {
  const page = await app.firstWindow()
  await page.waitForSelector('text=⬢ ZN Agentic PPT', { timeout: 15000 })
  await page.getByRole('button', { name: '+ 新建项目' }).first().click()
  // Verify modal opened
  await expect(page.locator('text=新建项目').first()).toBeVisible({ timeout: 5000 })
})
